/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import ClientCodeAws = require('../../../types/clientcodeaws')
import * as caws from '../../shared/clients/cawsClient'

// TODO: remove graphql
import * as gql from 'graphql-request'
import { TestSettingsConfiguration } from '../utilities/testSettingsConfiguration'

describe('cawsClient', function () {
    it('toCawsUrl()', async function () {
        const fakeSettings = new TestSettingsConfiguration()
        const c = new caws.CawsClient(fakeSettings, '', '', {} as ClientCodeAws, {} as gql.GraphQLClient, '')
        const org: caws.CawsOrg = {
            id: 'orgid1',
            name: 'org1',
        }
        const project: caws.CawsProject = {
            org: org,
            id: 'projectid1',
            name: 'project1',
        }
        const repo: caws.CawsRepo = {
            org: org,
            project: project,
            id: 'repoid1',
            name: 'repo1',
        }
        const prefix = `https://${caws.cawsHostname}/organizations`
        assert.deepStrictEqual(c.toCawsUrl(org), `${prefix}/org1/view`)
        assert.deepStrictEqual(c.toCawsUrl(project), `${prefix}/org1/projects/project1/view`)
        assert.deepStrictEqual(c.toCawsUrl(repo), `${prefix}/org1/projects/project1/source-repositories/repo1/view`)
    })
})
