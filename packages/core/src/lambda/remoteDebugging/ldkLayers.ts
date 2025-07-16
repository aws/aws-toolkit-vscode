/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

interface RegionAccountMapping {
    [region: string]: string
}

// Map region to account ID
export const regionToAccount: RegionAccountMapping = {
    'us-east-1': '166855510987',
    'ap-northeast-1': '435951944084',
    'us-west-1': '397974708477',
    'us-west-2': '116489046076',
    'us-east-2': '372632330791',
    'ca-central-1': '816313119386',
    'eu-west-1': '020236748984',
    'eu-west-2': '199003954714',
    'eu-west-3': '490913546906',
    'eu-central-1': '944487268028',
    'eu-north-1': '351516301086',
    'ap-southeast-1': '812073016575',
    'ap-southeast-2': '185226997092',
    'ap-northeast-2': '241511115815',
    'ap-south-1': '926022987530',
    'sa-east-1': '313162186107',
    'ap-east-1': '416298298123',
    'me-south-1': '511027370648',
    'me-central-1': '766358817862',
}

// Global layer version
const globalLayerVersion = 1

export function getRemoteDebugLayer(region: string, arch: string): string | undefined {
    const account = regionToAccount[region]

    if (!account) {
        return undefined
    }

    const layerName = arch === 'x86_64' ? 'LDKLayerX86' : 'LDKLayerArm64'

    return `arn:aws:lambda:${region}:${account}:layer:${layerName}:${globalLayerVersion}`
}
