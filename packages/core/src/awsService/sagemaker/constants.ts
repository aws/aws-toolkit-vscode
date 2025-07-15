/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const InstanceTypeError = 'InstanceTypeError'

export const InstanceTypeMinimum = 'ml.t3.large'

export const InstanceTypeInsufficientMemory: Record<string, string> = {
    'ml.t3.medium': 'ml.t3.large',
    'ml.c7i.large': 'ml.c7i.xlarge',
    'ml.c6i.large': 'ml.c6i.xlarge',
    'ml.c6id.large': 'ml.c6id.xlarge',
    'ml.c5.large': 'ml.c5.xlarge',
}

export const InstanceTypeInsufficientMemoryMessage = (
    spaceName: string,
    chosenInstanceType: string,
    recommendedInstanceType: string
) => {
    return `Unable to create app for [${spaceName}] because instanceType [${chosenInstanceType}] is not supported for remote access enabled spaces. Use instanceType with at least 8 GiB memory. Would you like to start your space with instanceType [${recommendedInstanceType}]?`
}

export const InstanceTypeNotSelectedMessage = (spaceName: string) => {
    return `No instanceType specified for [${spaceName}]. ${InstanceTypeMinimum} is the default instance type, which meets minimum 8 GiB memory requirements for remote access. Continuing will start your space with instanceType [${InstanceTypeMinimum}] and remotely connect.`
}
