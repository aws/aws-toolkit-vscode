/*!
 * Copyright 2020 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import { listValidMethods } from '../../../apigateway/commands/invokeRemoteRestApi'
import { Resource } from 'aws-sdk/clients/apigateway'

describe('listValidMethods', function () {
    const allMethods = ['DELETE', 'GET', 'HEAD', 'OPTIONS', 'PATCH', 'POST', 'PUT']
    it('returns all methods if "ANY" is a method', async function () {
        const resources = new Map<string, Resource>()
        const resource: Resource = {
            resourceMethods: {
                ANY: {},
            },
        }
        resources.set('resource', resource)

        const actual = listValidMethods(resources, 'resource')

        assert.deepStrictEqual(actual, allMethods)
    })
    it('returns dedupe-d all methods if "ANY" declared with another method', async function () {
        const resources = new Map<string, Resource>()
        const resource: Resource = {
            resourceMethods: {
                ANY: {},
                POST: {},
            },
        }
        resources.set('resource', resource)

        const actual = listValidMethods(resources, 'resource')

        assert.deepStrictEqual(actual, allMethods)
    })
    it('returns get if declares get', async function () {
        const resources = new Map<string, Resource>()
        const resource: Resource = {
            resourceMethods: {
                GET: {},
            },
        }
        resources.set('resource', resource)

        const actual = listValidMethods(resources, 'resource')

        assert.deepStrictEqual(actual, ['GET'])
    })
    it('returns nothing if no methods', async function () {
        const resources = new Map<string, Resource>()
        const resource: Resource = {}
        resources.set('resource', resource)

        const actual = listValidMethods(resources, 'resource')

        assert.deepStrictEqual(actual, [])
    })
})
