#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

set -e

if [[ "$#" -lt 2 || "$#" -gt 3 ]]
then
    echo "Incorrect number of arguments"
    echo "Usage: $0 <runner-asg-name> <region> <optional-aws-profile>"
    exit 1
fi

AutoScalingGroupName=$1
echo "Cycle instances in autoscaling group: "$AutoScalingGroupName

region=$2

if [[ -n "$3" ]]; then
  profile=$3
  IGNORE=$(aws sts get-caller-identity --profile "${profile}")
else
  profile="default"
  echo "No AWS profile was provided, hence using the default profile."
fi

aws autoscaling start-instance-refresh \
  --auto-scaling-group-name="${AutoScalingGroupName}" \
  --region="${region}" \
  --profile="${profile}"

echo "Refresh initiated"

exit 0

