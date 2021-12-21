import * as asg from "@aws-sdk/client-auto-scaling";
import {ClusterMetrics} from "./gatherMetrics";
import {SdkError} from "@aws-sdk/types";

export const adjustScaling = async (autoScalingGroupName : string, metrics : ClusterMetrics, desiredCount : number) => {
    if (metrics.currentInstances == desiredCount) {
        // nothing to do
        console.log(`Autoscaling group capacity does not require updates`)
        return
    }

    const client = new asg.AutoScalingClient({
        tls: true,
    })

    let honorCooldown: boolean
    if (metrics.currentInstances < desiredCount) {
        // we need to scale up, so do it immediately
        honorCooldown = false
    } else {
        // we want to scale down, but might have more requests coming in,
        // use the ASG delay
        honorCooldown = true
    }

    try {
        const command = new asg.SetDesiredCapacityCommand({
            AutoScalingGroupName: autoScalingGroupName,
            DesiredCapacity: desiredCount,
            HonorCooldown: honorCooldown,
        })
        console.log(`Setting desired capacity to ${desiredCount}`)
        await client.send(command)
    } catch (ex) {
        const checkError = ex as SdkError
        if (checkError?.name == "ScalingActivityInProgress") {
            console.log(`Cannot modify autoscaling, since scaling is still in-progress, or in cool-down.`)
        } else {
            throw ex
        }
    }
}