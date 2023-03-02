/*!
 * Copyright 2023 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import {
    CodeCatalystClient,
    CodeCatalystOrg,
    CodeCatalystProject,
    createClient as createCodeCatalystClient,
    DevEnvironment,
} from '../../shared/clients/codecatalystClient'
import { DeleteDevEnvironmentResponse } from 'aws-sdk/clients/codecatalyst'
import { prepareDevEnvConnection } from '../../codecatalyst/model'
import { Auth, SsoConnection } from '../../credentials/auth'
import { CodeCatalystAuthenticationProvider, isValidCodeCatalystConnection } from '../../codecatalyst/auth'
import { CodeCatalystCommands, DevEnvironmentSettings } from '../../codecatalyst/commands'
import globals from '../../shared/extensionGlobals'

let spaceName: CodeCatalystOrg['name']
let projectName: CodeCatalystProject['name']
let auth: Auth

/**
 * Key Information:
 *
 * This test can be run locally under the following conditions:
 *
 *   - You have previously configured BuilderId using the vscode extension.
 *     This is because this test uses BuilderId/SSO information
 *     that the extension would have naturally created in that process.
 *
 *   - A Space already exists in your Code Catalyst account.
 *     We cannot currently automate this due to space creation
 *     not being available in the Code Catalyst API.
 *
 *     TODO: Create a new space instead of using an existing one,
 *     if the api eventually allows us to do so.
 *
 *   - You do not have a Code Catalyst project with the same name
 *     as {@link projectName}. This project may be modified when
 *     this test is run.
 *
 * The test project cannot be torn down.
 *
 *   - The code catalyst api does not provide a way to delete
 *     a Project. So the project will exist in the Space unless
 *     deleted manually.
 *
 *     TODO: Delete the project when the test is done,
 *     if the api eventually allows us to do so.
 *
 * This provides a best effort to test the api functionality.
 *
 *   - There are more complexities involved in testing api functionality
 *     as if we were using the vscode UI, so this tests the underlying CC
 *     api functionliaty.
 *
 *     TODO: We can borrow some components from `src/test/globalSetup.test.ts`
 *     to be able to leverage `getTestWindow()` and then use that
 *     for UI actions testing.
 *
 *     TODO: Create separate tests that spin up a vscode extensionHost
 *     integ tests, but using the ssh hostname that we get from
 *     {@link prepareDevEnvConnection}.
 */
describe('Test how this codebase uses the Code Catalyst API', function () {
    let client: CodeCatalystClient
    let commands: CodeCatalystCommands

    before(async function () {
        if (process.env['AWS_TOOLKIT_AUTOMATION'] !== 'local') {
            this.skip()
        }

        commands = await createTestCodeCatalystCommands()

        auth = Auth.instance
        client = await createTestCodeCatalystClient()
        spaceName = (await getCurrentUsersSpace()).name
        projectName = (await tryCreateTestProject(spaceName)).name
        await deleteExistingDevEnvs(projectName)
    })

    /**
     * Returns the existing Sso connection that has been
     * verified to work with Code Catalyst.
     *
     * This relies on SSO information already being configured.
     */
    async function getCodeCatalystSsoConnection(): Promise<SsoConnection> {
        const builderIdSsoConnection = (await auth.listConnections()).find(isValidCodeCatalystConnection)
        assert.ok(builderIdSsoConnection, 'To fix, setup Builder Id as if you were a user of the extension.')
        return builderIdSsoConnection
    }

    /**
     * Creates a code catalyst commands instance.
     *
     * This holds the underlying functions that are triggered
     * when the user interacts with the vscode UI model.
     *
     * The goal is to test using this object as much as we can,
     * so we can test as close as we can to the user experience.
     * This can have interactions with vscode UI model.
     */
    async function createTestCodeCatalystCommands(): Promise<CodeCatalystCommands> {
        const ccAuthProvider = CodeCatalystAuthenticationProvider.fromContext(globals.context)
        return new CodeCatalystCommands(ccAuthProvider)
    }

    /**
     * Creates a code catalyst api client.
     */
    async function createTestCodeCatalystClient(): Promise<CodeCatalystClient> {
        const conn = await getCodeCatalystSsoConnection()
        return await createCodeCatalystClient(conn)
    }

    /**
     * Creates a specific CC Project if it does not already exist in the space.
     */
    async function tryCreateTestProject(spaceName: CodeCatalystOrg['name']): Promise<CodeCatalystProject> {
        // IMPORTANT: Be careful changing this if you plan to run locally.
        const projectName = 'aws-vscode-toolkit-integ-test-project'

        return client.createProject({
            spaceName,
            displayName: projectName,
            description: 'This project is autogenerated by the AWS Toolkit VSCode Integ Test.',
        })
    }

    /**
     * Gets the first code catalyst space it finds.
     *
     * The intention for this is to require no setup of a Space by the
     * user if they want to run this test locally.
     */
    async function getCurrentUsersSpace(): Promise<CodeCatalystOrg> {
        const firstPageOfSpaces = (await client.listSpaces().iterator().next()).value

        if (firstPageOfSpaces === undefined || firstPageOfSpaces.length === 0) {
            // Space must already exist due to CC not providing an api to create a space.
            throw new Error(
                'No spaces found in account. A Code Catalyst Space must be created manually before running this test.'
            )
        }

        const firstSpaceFound = firstPageOfSpaces[0]
        return firstSpaceFound
    }

    /**
     * Deletes any existing dev envs from the given project.
     */
    async function deleteExistingDevEnvs(projectName: CodeCatalystProject['name']): Promise<void> {
        const currentDevEnvs = await client
            .listDevEnvironments({ name: projectName, org: { name: spaceName }, type: 'project' })
            .flatten()
            .promise()
        await Promise.all(currentDevEnvs.map(async devEnv => deleteDevEnv(devEnv.id)))
    }

    /**
     * Deletes a specific dev env
     */
    function deleteDevEnv(id: DevEnvironment['id']): Promise<DeleteDevEnvironmentResponse> {
        return client.deleteDevEnvironment({
            spaceName,
            projectName,
            id: id,
        })
    }

    describe('Dev Environment apis', function () {
        let devEnv: DevEnvironment
        let devEnvSettings: DevEnvironmentSettings

        function createDevEnv(): Promise<DevEnvironment> {
            devEnvSettings = {
                instanceType: 'dev.standard1.small',
                persistentStorage: { sizeInGiB: 16 },
                alias: `test-alias-${Date.now()}`,
            }
            return client.createDevEnvironment({
                spaceName,
                projectName,
                ides: [{ name: 'VSCode' }],
                ...devEnvSettings,
            })
        }

        before(async function () {
            devEnv = await createDevEnv()
        })

        after(async function () {
            await deleteDevEnv(devEnv.id)
        })

        it('can succesfully create a Dev Environment', async function () {
            assert.strictEqual(devEnv.project.name, projectName)
            assert.strictEqual(devEnv.org.name, spaceName)
        })

        it('can ssh in to a Dev Environment', async function () {
            // Get necessary objects to run the ssh command.
            const { SessionProcess, hostname, sshPath } = await prepareDevEnvConnection(client, { ...devEnv })

            // Through ssh, run 'ls' command in the dev env.
            const lsOutput = (await new SessionProcess(sshPath, [hostname, 'ls', '/projects']).run()).stdout

            // Assert that a certain file exists in the dev env.
            const expectedFile = 'devfile.yaml'
            assert(lsOutput.split('\n').includes(expectedFile)) // File automatically created by CC
        })

        it('can update an existing dev environment', async function () {
            // Ensure current alias name is expected
            assert.strictEqual(devEnv.alias, devEnvSettings.alias)
            assert.strictEqual(devEnv.instanceType, devEnvSettings.instanceType)

            // Update dev env
            const devEnvSettingsToUpdate = { alias: `test-alias-${Date.now()}`, instanceType: 'dev.standard1.medium' }
            const updatedDevEnv = await commands.updateDevEnv(devEnv, devEnvSettingsToUpdate)

            // Ensure our update succeeded by checking for new properties
            assert.strictEqual(updatedDevEnv?.alias, devEnvSettingsToUpdate.alias)
            assert.strictEqual(updatedDevEnv?.instanceType, devEnvSettingsToUpdate.instanceType)
        })
    })
})
