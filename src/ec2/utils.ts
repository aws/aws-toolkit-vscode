/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { EC2 } from 'aws-sdk'
import { AsyncCollection } from "../shared/utilities/asyncCollection"

export function extractInstanceIdsFromReservations(reservations: AsyncCollection<EC2.ReservationList | undefined>): AsyncCollection<string> {
    return reservations
        .flatten()
        .map(instanceList => instanceList?.Instances)
        .flatten()
        .map(instance => instance?.InstanceId)
        .filter(instanceId => instanceId !== undefined)
} 
