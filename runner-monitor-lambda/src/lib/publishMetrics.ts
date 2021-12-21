import * as config from './config'
import {ClusterMetrics} from "./gatherMetrics";
import * as cw from "@aws-sdk/client-cloudwatch";

export const publishMetrics = async (metrics : ClusterMetrics, desiredCapacity : number) => {
    const now = new Date()
    const standardUnitCount = "Count"

    const jobCountMetric : cw.MetricDatum = {
        Value: metrics.currentJobCount,
        MetricName: config.runnerJobCountMetricName(),
        Timestamp: now,
        Unit: standardUnitCount,
    }

    const targetCapacityMetric : cw.MetricDatum = {
        Value: desiredCapacity,
        MetricName: config.runnerTargetCapacityMetricName(),
        Timestamp: now,
        Unit: standardUnitCount,
    }

    const actualCapacityMetric : cw.MetricDatum = {
        Value: metrics.currentInstances,
        MetricName: config.runnerActualCapacityMetricName(),
        Timestamp: now,
        Unit: standardUnitCount,
    }

    const client = new cw.CloudWatchClient({
        tls: true,
    })

    const command = new cw.PutMetricDataCommand({
        MetricData: [
            jobCountMetric,
            targetCapacityMetric,
            actualCapacityMetric,
        ],
        Namespace: config.runnerMetricNamespace(),
    })

    await client.send(command)
}