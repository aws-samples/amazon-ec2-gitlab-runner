#!/bin/bash

# Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
# SPDX-License-Identifier: MIT-0

if [[ "$#" -ne 4 ]]
then
    echo "Incorrect number of arguments"
    echo "Usage: $0 <properties-file-path> <region> <aws-profile> <stack-name>"
    exit 1
fi

errorExit()
{
    echo $1
    exit 1
}

callCloudFormation()
{
    aws cloudformation $1 \
        --stack-name ${stack_name} \
        --template-body file://gitlab-runner.yaml \
        --capabilities CAPABILITY_NAMED_IAM \
        --profile ${profile} \
        --region ${region} \
        --parameters \
            ParameterKey=VpcID,ParameterValue=${VpcID} \
            ParameterKey=SubnetIds,ParameterValue=\"${SubnetIds}\" \
            ParameterKey=ImageId,ParameterValue=\"${ImageId}\" \
            ParameterKey=InstanceType,ParameterValue=${InstanceType} \
            ParameterKey=InstanceName,ParameterValue=${InstanceName} \
            ParameterKey=VolumeSize,ParameterValue=${VolumeSize} \
            ParameterKey=VolumeType,ParameterValue=${VolumeType} \
            ParameterKey=MaxSize,ParameterValue=${MaxSize} \
            ParameterKey=MinSize,ParameterValue=${MinSize} \
            ParameterKey=DesiredCapacity,ParameterValue=${DesiredCapacity} \
            ParameterKey=MaxBatchSize,ParameterValue=${MaxBatchSize} \
            ParameterKey=MinInstancesInService,ParameterValue=${MinInstancesInService} \
            ParameterKey=MaxInstanceLifetime,ParameterValue=${MaxInstanceLifetime} \
            ParameterKey=GitlabServerURL,ParameterValue=${GitlabServerURL} \
            ParameterKey=DockerImagePath,ParameterValue=${DockerImagePath} \
            ParameterKey=RunnerRegistrationTokens,ParameterValue=\"${RunnerRegistrationTokens}\" \
            ParameterKey=RunnerVersion,ParameterValue=${RunnerVersion} \
            ParameterKey=RunnerEnvironment,ParameterValue=${RunnerEnvironment} \
            ParameterKey=LambdaS3Bucket,ParameterValue=${LambdaS3Bucket} \
            ParameterKey=TimeStamp,ParameterValue=$2 \
            ParameterKey=Concurrent,ParameterValue=${Concurrent} \
            ParameterKey=CheckInterval,ParameterValue=${CheckInterval} \
            ParameterKey=CostCenter,ParameterValue=${CostCenter} \
            ParameterKey=AppId,ParameterValue=${AppId}
}

verifyStackSuccess()
{
    status=$(aws cloudformation describe-stacks \
                                    --stack-name ${stack_name}  \
                                    --query "Stacks[0].StackStatus" \
                                    --profile ${profile} \
                                    --region ${region} \
                                    --output text) \
                                    || errorExit "Error getting stack status" 2> /dev/null

    if [ "${status}" == "$1" ]; then
        echo "Stack $2 was successful"
    else
        errorExit "Stack $2 failed (status ${status}). See CloudFormation console for error details"
    fi
}

uploadLifecycleHookToS3()
{
  file_name="${stack_name}-lifecycle-hook-${time_stamp}.zip"
  case "$OSTYPE" in
  solaris*) echo "SOLARIS" ;;
  darwin*)  echo "OSX" & zip ${file_name} gitlab-runner-lifecycle-hook.py;;
  linux*)   echo "LINUX" & zip ${file_name} gitlab-runner-lifecycle-hook.py;;
  bsd*)     echo "BSD" ;;
  msys|cygwin*)    echo "WINDOWS" & set MSYS_NO_PATHCONV=1 & jar -cvf ${file_name} gitlab-runner-lifecycle-hook.py;;
  *)        echo "unknown: $OSTYPE" ;;
  esac
  
  aws s3 cp --profile ${profile} ${file_name} s3://${LambdaS3Bucket}/${stack_name}/${file_name}
  if [ $? -ne 0 ]; then
      errorExit "Uploading lifecycle-hook lambda function code to S3 did not complete successfully."
  fi
  rm -f ${file_name}
}

uploadRunnerMonitorToS3() {
  # Note: Current lambda runtime for nodejs14 only supports aws-sdk 2.888.0,
  #  this project uses 3.x, so we have to include the aws-sdk in our function
    
  file_name="${stack_name}-runner-monitor-${time_stamp}.zip"

  cd runner-monitor-lambda
  npm install
  npm run build
  cd bin

  case "$OSTYPE" in
  solaris*) echo "SOLARIS" ;;
  darwin*)  echo "OSX" & zip -r ../../${file_name} *;;
  linux*)   echo "LINUX" & zip -r ../../${file_name} *;;
  bsd*)     echo "BSD" ;;
  msys|cygwin*)    echo "WINDOWS" & set MSYS_NO_PATHCONV=1 & jar -cvf ../../${file_name} *;;
  *)        echo "unknown: $OSTYPE" ;;
  esac

  cd ../..

  aws s3 cp --profile ${profile} ${file_name} s3://${LambdaS3Bucket}/${stack_name}/${file_name}
  if [ $? -ne 0 ]; then
      errorExit "Uploading lifecycle-hook lambda function code to S3 did not complete successfully."
  fi
  rm -f ${file_name}
}

deployStack()
{
    echo -n "Checking if stack already exists..."
    aws cloudformation describe-stacks --stack-name ${stack_name} --profile ${profile} --region ${region} --no-paginate --query="Stacks[].{Name: StackName}"

    if [ $? -ne 0 ]; then
        echo "Stack does not exist, creating it..."
        callCloudFormation "create-stack" ${time_stamp}

        if [ $? -ne 0 ]; then
            errorExit "Stack creation failed"
        fi

        echo -n "Waiting for stack creation to complete..."
        aws cloudformation wait stack-create-complete --stack-name ${stack_name} --profile ${profile} --region ${region} 2> /dev/null
        if [ $? -ne 0 ]; then
            echo
            echo -n "Stack creation completed with failure..."
        fi

        verifyStackSuccess "CREATE_COMPLETE" "create"
    else
        echo "Stack already exists. Attempting to update it..."
        callCloudFormation "update-stack" ${time_stamp} 2> temp.txt

        status=$?
        Temp=`cat temp.txt`
        rm -f temp.txt

        if [ ${status} -ne 0 ]; then
            if echo ${Temp} | grep "No updates are to be performed" > /dev/null ; then
                echo "No updates are needed"
                exit 0
            else
                errorExit "Stack update failed: ${Temp}"
            fi
        fi

        echo "Waiting for stack update to complete..."
        aws cloudformation wait stack-update-complete --stack-name ${stack_name} --profile ${profile} --region ${region} 2> /dev/null
        if [ $? -ne 0 ]; then
            echo "Stack update completed with failure..."
        fi

        verifyStackSuccess "UPDATE_COMPLETE" "update"
    fi
}

# Read properties for the stack
source $1 || errorExit "Unable to load properties"

region=$2
profile=$3
stack_name=$4

echo "Deploying Gitlab runner in region: "$region", using AWS profile: "$profile
echo "CloudFormation stack name: "$stack_name

#Suffix for the lambda zip
time_stamp=`date "+%Y%m%d%H%M%S"` 

uploadLifecycleHookToS3
uploadRunnerMonitorToS3
deployStack