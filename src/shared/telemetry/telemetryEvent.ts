/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

'use strict'

import { AwsContext } from '../awsContext'
import { MetadataEntry, MetricDatum } from './clienttelemetry'
import { Datum, TelemetryNamespace } from './telemetryTypes'

const NAME_ILLEGAL_CHARS_REGEX = new RegExp('[^\\w+-.:]', 'g')
const REMOVE_UNDERSCORES_REGEX = new RegExp('_', 'g')

export interface TelemetryEvent {
    namespace: string
    createTime: Date
    data?: Datum[]
}

export enum AccountStatus {
    NotApplicable = 'n/a',
    NotSet = 'not-set',
    Invalid = 'invalid'
}

export function toMetricData(
    array: TelemetryEvent[],
    awsContext: Pick<AwsContext, 'getCredentialAccountId'>
): MetricDatum[] {
    return ([] as MetricDatum[]).concat(...array.map( metricEvent => {
        const namespace = metricEvent.namespace.replace(REMOVE_UNDERSCORES_REGEX, '')
        const accountMetadata = createAccountIdMetadataObject(namespace, awsContext)

        if (metricEvent.data !== undefined) {
            const mappedEventData = metricEvent.data.map( datum => {
                const metadata: MetadataEntry[] = [accountMetadata]
                let unit = datum.unit

                if (datum.metadata !== undefined) {
                    metadata.push(...Array.from(datum.metadata).map(entry => {
                        return { Key: entry[0], Value: entry[1] }
                    }))
                }

                if (unit === undefined) {
                    unit = 'None'
                }

                const name = datum.name.replace(REMOVE_UNDERSCORES_REGEX, '')

                return {
                    MetricName: `${namespace}_${name}`.replace(NAME_ILLEGAL_CHARS_REGEX, ''),
                    EpochTimestamp: metricEvent.createTime.getTime(),
                    Unit: unit,
                    Value: datum.value,
                    Metadata: metadata
                }
            })

            return mappedEventData
        }

        // case where there are no datum attached to the event, but we should still publish this
        return {
            MetricName: namespace.replace(NAME_ILLEGAL_CHARS_REGEX, ''),
            EpochTimestamp: metricEvent.createTime.getTime(),
            Unit: 'None',
            Value: 0,
            Metadata: [accountMetadata]
        }
    }))
}

function createAccountIdMetadataObject(
    namespace: string,
    awsContext: Pick<AwsContext, 'getCredentialAccountId'>
): MetadataEntry {

    const accountIdRegex = /[0-9]{12}/

    if (namespace === TelemetryNamespace.Session) {
        // this matches JetBrains' functionality: the AWS account ID is not set on session start.
        return {
            Key: 'account',
            Value: AccountStatus.NotApplicable
        }
    } else {
        const account = awsContext.getCredentialAccountId()
        if (account) {
            if (accountIdRegex.test(account)) {
                // account is valid
                return {
                    Key: 'account',
                    Value: account
                }
            } else {
                // account is not valid, we can use any non-12-digit string as our stored value
                // JetBrains uses this value if you're running a sam local invoke with an invalid profile
                // no direct calls to production AWS should ever have this value.
                return {
                    Key: 'account',
                    Value: AccountStatus.Invalid
                }
            }
        } else {
            // user isn't logged in
            return {
                Key: 'account',
                Value: AccountStatus.NotSet
            }
        }
    }
}
