/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { AppStatus, SpaceStatus } from '@aws-sdk/client-sagemaker'
import { generateSpaceStatus } from '../../../awsService/sagemaker/utils'
import * as assert from 'assert'

describe('generateSpaceStatus', function () {
    it('returns Failed if space status is Failed', function () {
        assert.strictEqual(generateSpaceStatus(SpaceStatus.Failed, AppStatus.InService), 'Failed')
    })

    it('returns Failed if space status is Delete_Failed', function () {
        assert.strictEqual(generateSpaceStatus(SpaceStatus.Delete_Failed, AppStatus.InService), 'Failed')
    })

    it('returns Failed if space status is Update_Failed', function () {
        assert.strictEqual(generateSpaceStatus(SpaceStatus.Update_Failed, AppStatus.InService), 'Failed')
    })

    it('returns Failed if app status is Failed and space status is not Updating', function () {
        assert.strictEqual(generateSpaceStatus(SpaceStatus.Deleting, AppStatus.Failed), 'Failed')
    })

    it('does not return Failed if app status is Failed but space status is Updating', function () {
        assert.strictEqual(generateSpaceStatus(SpaceStatus.Updating, AppStatus.Failed), 'Updating')
    })

    it('returns Running if both statuses are InService', function () {
        assert.strictEqual(generateSpaceStatus(SpaceStatus.InService, AppStatus.InService), 'Running')
    })

    it('returns Starting if app is Pending and space is InService', function () {
        assert.strictEqual(generateSpaceStatus(SpaceStatus.InService, AppStatus.Pending), 'Starting')
    })

    it('returns Updating if space status is Updating', function () {
        assert.strictEqual(generateSpaceStatus(SpaceStatus.Updating, AppStatus.Deleting), 'Updating')
    })

    it('returns Stopping if app is Deleting and space is InService', function () {
        assert.strictEqual(generateSpaceStatus(SpaceStatus.InService, AppStatus.Deleting), 'Stopping')
    })

    it('returns Stopped if app is Deleted and space is InService', function () {
        assert.strictEqual(generateSpaceStatus(SpaceStatus.InService, AppStatus.Deleted), 'Stopped')
    })

    it('returns Stopped if app status is undefined and space is InService', function () {
        assert.strictEqual(generateSpaceStatus(SpaceStatus.InService, undefined), 'Stopped')
    })

    it('returns Deleting if space is Deleting', function () {
        assert.strictEqual(generateSpaceStatus(SpaceStatus.Deleting, AppStatus.InService), 'Deleting')
    })

    it('returns Unknown if none of the above match', function () {
        assert.strictEqual(generateSpaceStatus(undefined, undefined), 'Unknown')
        assert.strictEqual(
            generateSpaceStatus('SomeOtherStatus' as SpaceStatus, 'RandomAppStatus' as AppStatus),
            'Unknown'
        )
    })
})
