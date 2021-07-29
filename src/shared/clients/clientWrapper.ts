/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { CloudWatchLogs, Request, Service } from 'aws-sdk'
import { ServiceConfigurationOptions } from 'aws-sdk/lib/service'
import { ext } from '../../shared/extensionGlobals'

type SharedTypes<T1, T2> = {
    [Property in keyof T1 & keyof T2]: T1[Property] extends T1[Property] & T2[Property] ? T1[Property] : never
}

type SharedProp<T1, T2> = string & keyof SharedTypes<T1, T2>

type AccumulatableKeys<T> = NonNullable<
    {
        [Property in keyof T]: NonNullable<T[Property]> extends any[] | Record<string, unknown> ? Property : never
    }[keyof T]
>

function pageableToIterable<
    TRequest,
    TResponse,
    TTokenProp extends SharedProp<TRequest, TResponse>,
    TResult extends AccumulatableKeys<TResponse>,
    TTokenType extends TRequest[TTokenProp] & TResponse[TTokenProp]
>(
    requester: (request: TRequest) => Promise<TResponse>,
    request: TRequest,
    mark: TTokenProp,
    prop: TResult
): AsyncIterable<TResponse[TResult]> {
    return (async function* () {
        do {
            const response = await requester(request)
            yield response[prop]
            request[mark] = response[mark] as TTokenType
        } while (request[mark] !== undefined)
    })()
}

type PaginatedCalls<T> = {
    [Property in keyof T]: T[Property] extends (request: infer P) => Promise<infer R>
        ? Record<string, never> extends SharedTypes<P, R>
            ? never
            : AccumulatableKeys<R> extends never
            ? never
            : Property
        : never
}[keyof T]

type WithAll<T> = T &
    {
        [Property in PaginatedCalls<T> as `${Property}All`]: T[Property] extends (request: infer P) => Promise<infer R>
            ? (
                  request: P,
                  token: SharedProp<P, R>,
                  prop: AccumulatableKeys<R>
              ) => Promise<AsyncIterable<R[typeof prop]>>
            : never
    }

type PromisifySdkV2Calls<T> = {
    [Property in keyof T]: Underload<T[Property]>[0] extends (
        params: infer P,
        callback?: infer C
    ) => Request<infer D, infer E>
        ? P extends (...args: any) => any
            ? never
            : unknown extends P
            ? never
            : (params: P) => Promise<D>
        : never
}

type Underload<T> = T extends {
    (...args: infer P1): infer R1
    (...args: infer P2): infer R2
}
    ? [(...args: P1) => R1, (...args: P2) => R2]
    : any

type FilteredKeys<T> = { [Property in keyof T]: T[Property] extends never ? never : Property }[keyof T]
type NoNever<T> = Pick<T, FilteredKeys<T>>
type WrappedClient<T> = NoNever<WithAll<PromisifySdkV2Calls<Omit<T, 'waitFor'>>>>

export function wrapClient<T extends Service>(
    constructor: new (o: ServiceConfigurationOptions) => T,
    region: string,
    options?: ServiceConfigurationOptions
): WrappedClient<T> {
    return new Proxy(
        {},
        {
            get: (_, prop) => {
                if (prop === 'regionCode') {
                    return region
                }

                return (request: any, token?: any, subProp?: any) =>
                    ext.sdkClientBuilder.createAwsService(constructor, options, region).then(client => {
                        if (prop.toString().endsWith('All')) {
                            const requester: (request: any) => Promise<any> = request =>
                                client
                                    .makeRequest(prop.toString().slice(0, prop.toString().length - 3), request)
                                    .promise()

                            return pageableToIterable(requester, request, token, subProp)
                        } else {
                            return client.makeRequest(prop as any, request).promise()
                        }
                    })
            },
        }
    ) as WrappedClient<T>
}

const cwlogs = wrapClient(CloudWatchLogs, 'us-east-1')

async function test(): Promise<void> {
    for await (const log of await cwlogs.describeLogStreamsAll({ logGroupName: 'test' }, 'nextToken', 'logStreams')) {
        console.log(log)
    }
}
