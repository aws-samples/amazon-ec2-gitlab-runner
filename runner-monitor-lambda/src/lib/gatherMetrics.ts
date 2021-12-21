// assumptions: < 100 ec2 instances to support the gitlab runners

import {fetchUrl, sumReducer} from "./utils";
import {Ec2InstanceInfo, getAutoscalingGroupInfo, getEc2InstanceInfo} from "./asgInfo";

interface InstanceMetrics {
    instanceId: string
    jobCount: number
    error : string | null
}

export interface ClusterMetrics {
    minInstances: number
    maxInstances: number
    currentInstances: number
    activeInstances: number
    currentJobCount: number
    instances : InstanceMetrics[],
}

export const gatherClusterMetrics = async (autoScalingGroupName : string) : Promise<ClusterMetrics> => {
    const asgInfo = await getAutoscalingGroupInfo(autoScalingGroupName)
    if (asgInfo.instanceIds.length == 0) {
        console.log("no instances available in the autoScalingGroup")
        return {
            currentJobCount: 0,
            currentInstances: asgInfo.currentCapacity,
            activeInstances: 0,
            minInstances: asgInfo.minSize,
            maxInstances: asgInfo.maxSize,
            instances: [],
        }
    }

    console.log(`Instances in autoscaling group: ${asgInfo.instanceIds.length}`)
    const runnerInstanceInfo = await getEc2InstanceInfo(asgInfo.instanceIds)
    if (runnerInstanceInfo.length == 0) {
        console.log("no runner instances are available in the autoScalingGroup")
        return {
            currentJobCount: 0,
            currentInstances: asgInfo.currentCapacity,
            activeInstances: 0,
            minInstances: asgInfo.minSize,
            maxInstances: asgInfo.maxSize,
            instances: [],
        }
    }

    const asyncMetrics = runnerInstanceInfo.map((instance) => {
        return getMetricsForInstance(instance)
    })

    const metrics = await Promise.all(asyncMetrics)

    console.log(`All metrics retrieved`)

    const totalBuildCount = metrics
        .map((metric) => metric.jobCount)
        .reduce(sumReducer, 0)

    console.log(`Total build count: ${totalBuildCount}`)

    const activeInstanceCount = metrics
        .filter(metric => instanceHasErrors(metric) == false)
        .length

    console.log(`Active Instance Count: ${activeInstanceCount}`)

    return {
        currentJobCount: totalBuildCount,
        currentInstances: asgInfo.currentCapacity,
        activeInstances: activeInstanceCount,
        minInstances: asgInfo.minSize,
        maxInstances: asgInfo.maxSize,
        instances: metrics,
    }
}

const getMetricsForInstance = async (instance: Ec2InstanceInfo): Promise<InstanceMetrics> => {
    const prometheusUrl = `http://${instance.privateIpAddress}:9252/metrics`
    try {
        console.log(`Fetching metrics from url: ${prometheusUrl}`)
        const prometheusContent = await fetchUrl(prometheusUrl)

        const buildCount = countCurrentBuilds(prometheusContent)
        console.log(`For url: ${prometheusUrl} Build Count is ${buildCount}`)
        return {
            instanceId : instance.instanceId,
            jobCount : buildCount,
            error: null,
        }
    } catch (ex) {
        if (ex instanceof Error) {
            console.log(`Error getting metrics from url ${prometheusUrl}, error: ${ex}`)
            return {
                instanceId: instance.instanceId,
                jobCount: 0,
                error: ex.toString()
            }
        } else {
            throw ex
        }
    }
}

const countCurrentBuilds = (prometheusContent: string): number => {
    const contentLines = prometheusContent.split('\n')
    const buildCount = contentLines
        .filter((line) => {
            // Find the lines that correspond to the job counts
            return line.startsWith("gitlab_runner_jobs{")
        })
        .map((line) => {
            // The last field in this line is the # of builds
            const lineParts = line.split(' ')
            const counterText = lineParts[lineParts.length - 1]
            return parseInt(counterText)
        })
        .reduce(sumReducer, 0)
    return buildCount
}

export const instanceHasErrors = (instance : InstanceMetrics) : boolean => {
    return (instance.error) ? true : false
}