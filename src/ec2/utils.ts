/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { Ec2Instance } from '../shared/clients/ec2Client'

export function getIconCode(instance: Ec2Instance) {
    if (instance.status === 'running') {
        return 'pass'
    }

    if (instance.status === 'stopped') {
        return 'circle-slash'
    }

    return 'loading~spin'
}
