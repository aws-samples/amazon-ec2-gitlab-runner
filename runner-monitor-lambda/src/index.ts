/*
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: MIT-0
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this
 * software and associated documentation files (the "Software"), to deal in the Software
 * without restriction, including without limitation the rights to use, copy, modify,
 * merge, publish, distribute, sublicense, and/or sell copies of the Software, and to
 * permit persons to whom the Software is furnished to do so.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
 * INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A
 * PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
 * HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION
 * OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
 * SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */

import * as config from './lib/config'
import * as lambda from "aws-lambda";
import {ClusterMetrics, gatherClusterMetrics} from "./lib/gatherMetrics";
import {publishMetrics} from "./lib/publishMetrics";
import {adjustScaling} from "./lib/adjustScaling";

export const handler = async (event : lambda.ScheduledEvent, context : lambda.Context | null) : Promise<void> => {
    const autoScalingGroupName = config.autoScalingGroupName()

    console.log(`Retrieving cluster metrics`)
    const metrics = await gatherClusterMetrics(autoScalingGroupName)

    console.log(`Determining desired capacity`)
    const desiredCapacity = determineDesiredCapacity(metrics)
    console.log(`Desired Capacity: ${desiredCapacity}`)

    console.log(`Publishing metrics`)
    await publishMetrics(metrics, desiredCapacity)

    console.log(`Adjusting autoscaling`)
    await adjustScaling(autoScalingGroupName, metrics, desiredCapacity)

    console.log(`Done`)
}

const determineDesiredCapacity = (metrics : ClusterMetrics) : number => {
    // the number of jobs that can run concurrently per runner
    const concurrentJobsPerRunner = config.maximumConcurrentJobsPerRunner()
    // the number of new jobs we want to be able to handle within triggering another scaling event
    const newJobCountBeforeScaling = config.countOfNewJobsBeforeScaling();

    // pretend like we're going to add more jobs, and figure out the number of instances we need to handle that
    let desiredCapacity = (metrics.currentJobCount + newJobCountBeforeScaling) / concurrentJobsPerRunner
    desiredCapacity = Math.ceil(desiredCapacity)
    // Make sure we dont go below our min
    desiredCapacity = Math.max(desiredCapacity, metrics.minInstances)
    // Make sure we dont go above our max
    desiredCapacity = Math.min(desiredCapacity, metrics.maxInstances)
    return desiredCapacity
}