/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { SafeEc2Instance } from '../../shared/clients/ec2Client'

export function getIconCode(instance: SafeEc2Instance) {
    if (instance.LastStatus === 'running') {
        return 'check'
    }

    if (instance.LastStatus === 'stopped') {
        return 'stop'
    }

    return 'loading~spin'
}
