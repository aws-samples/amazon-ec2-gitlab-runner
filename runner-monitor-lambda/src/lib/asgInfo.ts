import * as asg from "@aws-sdk/client-auto-scaling";
import * as ec2 from "@aws-sdk/client-ec2";

export interface AutoScalingGroupInfo {
    autoScalingGroupName: string
    maxSize: number
    minSize: number
    currentCapacity: number
    instanceIds: string[]
}

export interface Ec2InstanceInfo {
    instanceId: string
    privateIpAddress: string
    launchTime: Date | undefined
}

export const getAutoscalingGroupInfo = async (autoScalingGroupName : string): Promise<AutoScalingGroupInfo> => {
    const client = new asg.AutoScalingClient({
        tls: true,
    })

    const command = new asg.DescribeAutoScalingGroupsCommand({
        AutoScalingGroupNames: [
            autoScalingGroupName,
        ]
    })

    const response = await client.send(command)
    if (response.AutoScalingGroups == null || response.AutoScalingGroups.length == 0) {
        throw new Error("autoScalingGroup not found")
    }
    const group = response.AutoScalingGroups[0]
    if (group.Instances == null) {
        throw new Error("autoScalingGroup.Instances not found")
    }
    if (group.MinSize == null) {
        throw new Error("autoScalingGroup.MinSize not found")
    }
    if (group.MaxSize == null) {
        throw new Error("autoScalingGroup.MaxSize not found")
    }
    if (group.DesiredCapacity == null) {
        throw new Error("autoScalingGroup.DesiredCapacity not found")
    }

    const activeInstances = group.Instances.filter(i => {
        switch (i.LifecycleState) {
            case asg.LifecycleState.IN_SERVICE:
            case asg.LifecycleState.PENDING:
                return true
            default:
                return false
        }
    })

    const activeInstanceIds = activeInstances.map((i) => i.InstanceId || "").filter(i => i != "")

    return {
        autoScalingGroupName: autoScalingGroupName,
        instanceIds: activeInstanceIds,
        maxSize: group.MaxSize,
        minSize: group.MinSize,
        currentCapacity: group.DesiredCapacity,
    }
}

export const getEc2InstanceInfo = async (instanceIds: string[]): Promise<Ec2InstanceInfo[]> => {
    const client = new ec2.EC2Client({
        tls: true,
    })

    const command = new ec2.DescribeInstancesCommand({
        InstanceIds: instanceIds,
    })

    const result = await client.send(command)
    if (result.Reservations == null) {
        throw new Error("instance reservations not found")
    }

    const runnerInstances: ec2.Instance[] = []

    for (let x = 0; x < result.Reservations.length; x++) {
        const r = result.Reservations[x]
        if (r.Instances == null) {
            continue
        }

        const validInstances = r.Instances.filter(instance => {
            if (instance == null || instance.PrivateIpAddress == null) {
                return false
            }

            if (instance.State?.Name != "running") {
                return false
            }

            return true
        })

        runnerInstances.push(...validInstances)
    }

    const instanceData = runnerInstances.map((instance): Ec2InstanceInfo => {
        return {
            instanceId: instance.InstanceId as string,
            privateIpAddress: instance.PrivateIpAddress as string,
            launchTime: instance.LaunchTime,
        }
    })

    return instanceData
}
