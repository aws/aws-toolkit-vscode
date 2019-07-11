/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { hostedFilesBaseUrl } from '../shared/constants'

export const blueprintsManifestPath: string =
    'LambdaSampleFunctions/NETCore/msbuild-v4/vs-lambda-blueprint-manifest.xml'
export const sampleRequestBase: string = 'LambdaSampleFunctions/SampleRequests'
export const sampleRequestPath: string = `${hostedFilesBaseUrl}${sampleRequestBase}/`
export const sampleRequestManifestPath: string = `${hostedFilesBaseUrl}${sampleRequestBase}/manifest.xml`
