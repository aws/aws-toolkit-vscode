/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { hasStringProps } from '../utilities/tsUtils'

// The AWS SDK v3 has an ARN parser util, however, it is too simple to be useful
// for parsing user input or files.

export interface Arn {
    readonly partition: string
    readonly service: string
    readonly region: string
    readonly accountId: string
    readonly resource: string
}

export interface ParseResult {
    readonly data: Arn
    readonly offset: number
    readonly text: string
}

export function toString(arn: Arn): string {
    return `arn:${arn.partition}:${arn.service}:${arn.region}:${arn.accountId}:${arn.resource}`
}

export function isArn(obj: unknown): obj is Arn {
    const props: (keyof Arn)[] = ['partition', 'service', 'region', 'accountId', 'resource']

    return typeof obj === 'object' && !!obj && hasStringProps(obj, ...props)
}

export function parse(text: string): Arn {
    const { value, done } = parseAll(text).next() // FIXME: we should only match exactly

    if (done) {
        throw new Error('Not a valid ARN') // We can obviously do better
    }

    return value.data
}

export function* parseAll(text: string): Generator<ParseResult> {
    const regexp = new RegExp(arnRegexp.source, arnRegexp.flags)
    let match: RegExpExecArray | null

    // A simple two-step parsing strategy could be used here to find malformed ARNs in addition
    // to valid ones. The first pass finds the candidates, the 2nd drills into specific resource types.
    while ((match = regexp.exec(text))) {
        yield {
            data: mapMatch(match),
            text: match[0],
            offset: match.index,
        }
    }
}

const unescaped = [
    /arn:/,
    /(?<partition1>(?:aws)|(?:aws-cn)|(?:aws-us-gov)):/,
    /(?<service1>[\w\-]{1,128}):/,
    /(?<region1>[\w\-]{0,128}):/,
    /(?<accountId1>[0-9]{0,128}):/,
    /(?<resource1>[^\s]{0,2048}[^\s'",.!])/,
]

const escaped = [
    /arn:/,
    /(?<partition2>(?:aws)|(?:aws-cn)|(?:aws-us-gov)):/,
    /(?<service2>[\w\-]{1,128}):/,
    /(?<region2>[\w\-]{0,128}):/,
    /(?<accountId2>[0-9]{0,128}):/,
    /(?<resource2>.{0,2048})/,
]

const r1 = unescaped.reduce((a, b) => new RegExp(a.source + b.source), new RegExp(''))
const r2 = escaped.reduce((a, b) => new RegExp(a.source + b.source), new RegExp(''))
const arnRegexp = new RegExp(`(?:${r1.source})|(?:(?<quote>'|")${r2.source}\\k<quote>)`, 'g')

// Safety: unit tests make sure that these keys are accurate
function getKey(groups: Record<string, string>, key: string): string {
    return groups[`${key}1`] ?? groups[`${key}2`]
}

function mapMatch(match: RegExpExecArray): Arn {
    const groups = match.groups

    if (!groups) {
        throw new Error('No match groups found')
    }

    return {
        partition: getKey(groups, 'partition'),
        service: getKey(groups, 'service'),
        region: getKey(groups, 'region'),
        accountId: getKey(groups, 'accountId'),
        resource: getKey(groups, 'resource'),
    }
}
