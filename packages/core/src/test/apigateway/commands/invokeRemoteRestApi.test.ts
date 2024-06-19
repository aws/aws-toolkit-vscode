/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import assert from 'assert'
import { listValidMethods } from '../../../apigateway/vue/invokeRemoteRestApi'
import { Resource } from 'aws-sdk/clients/apigateway'

describe('listValidMethods', function () {
    const allMethods = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT']
    it('returns all methods if "ANY" is a method', async function () {
        const resource: Resource = {
            resourceMethods: {
                ANY: {},
            },
        }

        const actual = listValidMethods(resource)

        assert.deepStrictEqual(actual, allMethods)
    })
    it('returns dedupe-d all methods if "ANY" declared with another method', async function () {
        const resource: Resource = {
            resourceMethods: {
                ANY: {},
                POST: {},
            },
        }

        const actual = listValidMethods(resource)

        assert.deepStrictEqual(actual, allMethods)
    })
    it('returns get if declares get', async function () {
        const resource: Resource = {
            resourceMethods: {
                GET: {},
            },
        }

        const actual = listValidMethods(resource)

        assert.deepStrictEqual(actual, ['GET'])
    })
    it('returns nothing if no methods', async function () {
        const resource: Resource = {}

        const actual = listValidMethods(resource)

        assert.deepStrictEqual(actual, [])
    })
})
