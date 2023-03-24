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
import { prepareDevEnvConnection } from '../../codecatalyst/model'
import { Auth, SsoConnection } from '../../credentials/auth'
import { CodeCatalystAuthenticationProvider, isValidCodeCatalystConnection } from '../../codecatalyst/auth'
import { CodeCatalystCommands, DevEnvironmentSettings } from '../../codecatalyst/commands'
import globals from '../../shared/extensionGlobals'
import { CodeCatalystCreateWebview, SourceResponse } from '../../codecatalyst/vue/create/backend'
import { waitUntil } from '../../shared/utilities/timeoutUtils'
import { AccessDeniedException } from '@aws-sdk/client-sso-oidc'
import { GetDevEnvironmentRequest } from 'aws-sdk/clients/codecatalyst'
import { integrationSuite } from '../../../scripts/test/launchTestUtilities'

let spaceName: CodeCatalystOrg['name']
let projectName: CodeCatalystProject['name']

// This is a public Space, use it carefully.
// Ask someone from the VSCode team to add you to this CC space
// if needed. It has many Projects in it
const multiUserOrg = 'multiUserOrg'

/**
 * Key Information:
 *
 * This test can be run locally under the following conditions:
 *
 *   - You have previously configured BuilderId using the vscode extension.
 *     This is because this test uses BuilderId/SSO information
 *     that the extension would have naturally created in that process.
 *
 *   - A Space already exists in your CodeCatalyst account.
 *     We cannot currently automate this due to space creation
 *     not being available in the CodeCatalyst API.
 *
 *     TODO: Create a new space instead of using an existing one,
 *     if the api eventually allows us to do so.
 *
 *   - You do not have a CodeCatalyst project with the same name
 *     as {@link projectName} and {@link isolatedProjectName}.
 *     These projects are modified when this test is run.
 *
 * The test project cannot be torn down.
 *
 *   - The CodeCatalyst api does not provide a way to delete
 *     a Project. So the projects will exist in the Space unless
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
 *     There are different clients in this test that are used in different
 *     parts of the CC process. Choose the best client for your usecase.
 *
 *     TODO: We can borrow some components from `src/test/globalSetup.test.ts`
 *     to be able to leverage `getTestWindow()` and then use that
 *     for UI actions testing.
 *
 *     TODO: Create separate tests that spin up a vscode extensionHost
 *     integ tests, but using the ssh hostname that we get from
 *     {@link prepareDevEnvConnection}.
 */
describe('Test how this codebase uses the CodeCatalyst API', function () {
    let client: CodeCatalystClient
    let commands: CodeCatalystCommands
    let webviewClient: CodeCatalystCreateWebview

    before(async function () {
        if (!['local', integrationSuite].includes(process.env['AWS_TOOLKIT_AUTOMATION'] ?? '')) {
            this.skip()
        }

        // These instances all interact with the CC API at some point.
        // Use the right one for your use case.
        commands = await createTestCodeCatalystCommands()
        client = await createTestCodeCatalystClient(Auth.instance)
        webviewClient = new CodeCatalystCreateWebview(client, CodeCatalystCommands.declared, () => {})

        spaceName = (await getCurrentUsersSpace()).name
        projectName = (await tryCreateTestProject(spaceName)).name

        await deleteExistingDevEnvs(projectName)
    })

    describe('Dev Environment functionality', function () {
        let defaultDevEnv: DevEnvironment
        let defaultDevEnvSettings: DevEnvironmentSettings

        const isolatedProjectName = 'aws-toolkit-integ-test-project-isolated'

        before(async function () {
            defaultDevEnvSettings = buildDevEnvSettings()
            defaultDevEnv = await createDevEnv(defaultDevEnvSettings)
        })

        after(async function () {
            await Promise.all([deleteExistingDevEnvs(projectName), deleteExistingDevEnvs(isolatedProjectName)])
        })

        it('creates an empty Dev Environment', async function () {
            const emptyDevEnvSettings = buildDevEnvSettings()
            const emptyDevEnv = await webviewClient.createDevEnvOfType(emptyDevEnvSettings, {
                type: 'none',
                selectedProject: { name: projectName, org: { name: spaceName }, type: 'project' },
            })
            assert.strictEqual(emptyDevEnv.project.name, projectName)
            assert.strictEqual(emptyDevEnv.org.name, spaceName)
        })

        it('creates a Dev Environment with a different instance type + storage', async function () {
            const differentDevEnvSettings = buildDevEnvSettings('dev.standard1.medium', { sizeInGiB: 32 })

            const actualDevEnv = await webviewClient.createDevEnvOfType(differentDevEnvSettings, {
                type: 'none',
                selectedProject: { name: projectName, org: { name: spaceName }, type: 'project' },
            })

            assert.strictEqual(actualDevEnv.project.name, projectName)
            assert.strictEqual(actualDevEnv.org.name, spaceName)
            assert.strictEqual(actualDevEnv.alias, differentDevEnvSettings.alias)
            assert.strictEqual(actualDevEnv.instanceType, 'dev.standard1.medium')
            assert.strictEqual(actualDevEnv.persistentStorage.sizeInGiB, 32)
        })

        it('creates a Dev Environment using an existing branch', async function () {
            // TODO: The CC API does not provide a way to create a repository
            // due to this we'll want to revisit this test.
            // For now, we can manually create repository in the test project
            // and then continue this test from that point.
        })

        it('connects to a running Dev Environment', async function () {
            // Get necessary objects to run the ssh command.
            const { SessionProcess, hostname, sshPath } = await prepareDevEnvConnection(client, { ...defaultDevEnv })

            // Through the actual ssh connection, run 'ls' command in the dev env.
            const lsOutput = (await new SessionProcess(sshPath, [hostname, 'ls', '/projects']).run()).stdout

            // Assert that a certain file exists in the dev env.
            const expectedFile = 'devfile.yaml' // File automatically created by CC
            assert(lsOutput.split('\n').includes(expectedFile))
        })

        /**
         * IMPORTANT: This test takes a while to run. Stopping a Dev Env takes time.
         */
        it('stops a running Dev Environment, then starts it up again', async function () {
            // Ensure existing Dev Env is running
            const devEnvData = {
                spaceName: defaultDevEnv.org.name,
                projectName: defaultDevEnv.project.name,
                id: defaultDevEnv.id,
            }
            await waitUntilDevEnvStatus(devEnvData, ['RUNNING'])

            // Stop Dev Env
            await client.stopDevEnvironment(devEnvData)
            await waitUntilDevEnvStatus(devEnvData, ['STOPPED'])

            // Start Dev Env
            await prepareDevEnvConnection(client, { ...defaultDevEnv })
            await waitUntilDevEnvStatus(devEnvData, ['RUNNING'])
        })

        it('updates the properties of an existing dev environment', async function () {
            const newDevEnvSettings = { alias: createAlias(), instanceType: 'dev.standard1.medium' }

            // Ensure current properties do not equal the updated properties
            assert.notStrictEqual(defaultDevEnv.alias, newDevEnvSettings.alias)
            assert.notStrictEqual(defaultDevEnv.instanceType, newDevEnvSettings.instanceType)

            // Update dev env
            const updatedDevEnv = await commands.updateDevEnv(defaultDevEnv, newDevEnvSettings)

            // Ensure our update succeeded by checking for new properties
            assert.strictEqual(updatedDevEnv?.alias, newDevEnvSettings.alias)
            assert.strictEqual(updatedDevEnv?.instanceType, newDevEnvSettings.instanceType)
        })

        it('creates multiple dev envs, lists them, then deletes them', async function () {
            // We want a clean project for this test due to additional dev envs
            // from previous tests polluting the 'list dev env' output.
            await tryCreateTestProject(spaceName, isolatedProjectName)
            await deleteExistingDevEnvs(isolatedProjectName)

            // Create multiple Dev Envs
            const projectSource: SourceResponse = {
                type: 'none',
                selectedProject: { name: isolatedProjectName, org: { name: spaceName }, type: 'project' },
            }
            const createdDevEnvs = await Promise.all([
                webviewClient.createDevEnvOfType(buildDevEnvSettings(), projectSource),
                webviewClient.createDevEnvOfType(buildDevEnvSettings(), projectSource),
            ])
            assert.strictEqual(createdDevEnvs.length, 2)

            // List all Dev Envs
            const listedDevEnvs = await getAllDevEnvs(isolatedProjectName)

            const actualDevEnvIds = listedDevEnvs.map(d => d.id)
            const expectedDevEnvIds = createdDevEnvs.map(d => d.id)
            assert.deepStrictEqual(
                actualDevEnvIds.sort((a, b) => a.localeCompare(b)),
                expectedDevEnvIds.sort((a, b) => a.localeCompare(b)),
                'The list dev envs dont match'
            )

            // Delete all Dev Envs
            await Promise.all(listedDevEnvs.map(devEnv => commands.deleteDevEnv(devEnv)))
            const remainingDevEnvs = await getAllDevEnvs(isolatedProjectName)
            if (remainingDevEnvs.length > 0) {
                // Dev Envs may still be returned if they are still in the process of being deleted.
                // Just ensure they are in the process or fully deleted.
                remainingDevEnvs.forEach(devEnv => {
                    assert.ok(['DELETING', 'DELETED'].includes(devEnv.status), 'Dev Env was not successfully deleted')
                })
            }
        })

        it('lists all spaces for the given user', async function () {
            const spaces = await client.listSpaces().flatten().promise()
            const expectedSpaces = [spaceName, multiUserOrg]
            spaces.forEach(space => {
                assert.ok(expectedSpaces.includes(space.name))
            })
        })

        it('lists all projects for the given user', async function () {
            // Create lots of projects
            // const ephemeralProjectNames = []
            // for (let index = 0; index < 30; index++) {
            //     ephemeralProjectNames.push(`ephemeral-project-${index}`)
            // }
            // await Promise.all(
            //     ephemeralProjectNames.map(name => tryCreateTestProject(spaceName, name))
            // )
            // const projects = await client.listProjects({spaceName}).flatten().promise()
        })

        function buildDevEnvSettings(
            instanceType: DevEnvironmentSettings['instanceType'] = 'dev.standard1.small',
            persistentStorage: DevEnvironmentSettings['persistentStorage'] = { sizeInGiB: 16 }
        ): DevEnvironmentSettings {
            return {
                instanceType,
                persistentStorage,
                alias: createAlias(),
            }
        }

        /** Creates a unique alias for a dev environment. */
        function createAlias(): NonNullable<DevEnvironment['alias']> {
            return `test-alias-${Date.now() + Math.random()}`
        }

        function createDevEnv(devEnvSettings: DevEnvironmentSettings): Promise<DevEnvironment> {
            return client.createDevEnvironment({
                spaceName,
                projectName,
                ides: [{ name: 'VSCode' }],
                ...devEnvSettings,
            })
        }
    })

    /**
     * Creates a CodeCatalyst commands instance.
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
     * Creates a CodeCatalyst api client.
     */
    async function createTestCodeCatalystClient(auth: Auth): Promise<CodeCatalystClient> {
        const conn = await getCodeCatalystSsoConnection(auth)
        return await createCodeCatalystClient(conn)
    }

    /**
     * Returns the existing Sso connection that has been
     * verified to work with CodeCatalyst.
     *
     * This relies on SSO information already being configured.
     */
    async function getCodeCatalystSsoConnection(auth: Auth): Promise<SsoConnection> {
        const builderIdSsoConnection = (await auth.listConnections()).find(isValidCodeCatalystConnection)
        assert.ok(builderIdSsoConnection, 'To fix, setup Builder Id as if you were a user of the extension.')
        return builderIdSsoConnection
    }

    /**
     * Creates a specific CC Project if it does not already exist in the space.
     * @param projectName The name of the test project. Be careful changing this if you plan to run locally.
     */
    async function tryCreateTestProject(
        spaceName: CodeCatalystOrg['name'],
        projectName: CodeCatalystProject['name'] = 'aws-vscode-toolkit-integ-test-project'
    ): Promise<CodeCatalystProject> {
        return client.createProject({
            spaceName,
            displayName: projectName,
            description: 'This project is autogenerated by the AWS Toolkit VSCode Integ Test.',
        })
    }

    /**
     * Gets the first CodeCatalyst space it finds.
     *
     * The intention for this is to require no setup of a Space by the
     * user if they want to run this test locally.
     */
    async function getCurrentUsersSpace(): Promise<CodeCatalystOrg> {
        const firstPageOfSpaces = (await client.listSpaces().iterator().next()).value

        if (firstPageOfSpaces === undefined || firstPageOfSpaces.length === 0) {
            // Space must already exist due to CC not providing an api to create a space.
            throw new Error(
                'No spaces found in account. A CodeCatalyst Space must be created manually before running this test.'
            )
        }

        const firstSpaceFound = firstPageOfSpaces[0]
        return firstSpaceFound
    }

    /**
     * Deletes any existing dev envs from the given project, resolves only
     * once all are fully deleted on the server side.
     */
    async function deleteExistingDevEnvs(projectName: CodeCatalystProject['name']): Promise<void> {
        const currentDevEnvs = await getAllDevEnvs(projectName)

        // Deleting a dev env that has already been deleted will throw an error.
        // We need to be selective about which dev envs get explicitly deleted.
        const devEnvsToDelete = currentDevEnvs
            .filter(devEnv => !['DELETING', 'DELETED'].includes(devEnv.status))
            .map(async devEnv => deleteDevEnv(projectName, devEnv.id))

        // These dev envs are already in the process of being deleted, so we just need to wait until they are fully deleted.
        const devEnvsToWaitForDeletion = currentDevEnvs
            .filter(devEnv => ['DELETING'].includes(devEnv.status))
            .map(async devEnv => waitUntilDevEnvDeleted(projectName, devEnv.id))

        await Promise.all([...devEnvsToDelete, ...devEnvsToWaitForDeletion])
    }

    async function getAllDevEnvs(projectName: CodeCatalystProject['name']): Promise<DevEnvironment[]> {
        const currentDevEnvs = await client
            .listDevEnvironments({ name: projectName, org: { name: spaceName }, type: 'project' })
            .flatten()
            .promise()
        return currentDevEnvs
    }

    /**
     * Deletes a specific dev env and only returns when it is fully
     * deleted on the server
     */
    async function deleteDevEnv(projectName: CodeCatalystProject['name'], id: DevEnvironment['id']): Promise<void> {
        await commands.deleteDevEnv({
            org: { name: spaceName },
            project: { name: projectName },
            id: id,
        })

        return waitUntilDevEnvDeleted(projectName, id)
    }

    /**
     * waits until the dev env is fully deleted in the server.
     *
     * This function is needed specifically for a dev env in the deletion
     * process since an error will be thrown when we try to get the dev environment
     * but it has been successfully deleted.
     */
    async function waitUntilDevEnvDeleted(projectName: CodeCatalystProject['name'], id: DevEnvironment['id']) {
        const result = await waitUntil(
            async function () {
                let devEnvBeingDeleted: DevEnvironment
                try {
                    devEnvBeingDeleted = await client.getDevEnvironment({ spaceName, projectName, id })
                } catch (e) {
                    if (e instanceof Error && e.name === AccessDeniedException.name) {
                        // This error is thrown because the dev env does not exist anymore
                        // on the server. The name doesn't make it obvious IMO.
                        return true
                    }
                    throw e
                }
                return devEnvBeingDeleted.status === 'DELETED'
            },
            {
                interval: 1000,
                timeout: 60000,
            }
        )
        if (!result) {
            throw new Error(`Dev env ${id} did not transition to DELETED status before timeout.`)
        }
    }

    /**
     * Asserts that a given dev env has one of the given statuses, it will fail
     * if the timeout is reached.
     */
    async function waitUntilDevEnvStatus(
        devEnv: GetDevEnvironmentRequest,
        status: DevEnvironment['status'][]
    ): Promise<void> {
        const result = await waitUntil(
            async function () {
                const devEnvData = await client.getDevEnvironment({
                    spaceName: devEnv.spaceName,
                    projectName: devEnv.projectName,
                    id: devEnv.id,
                })
                return status.includes(devEnvData.status)
            },
            {
                interval: 1000,
                timeout: 120000,
            }
        )

        if (!result) {
            throw new Error(
                `Dev env ${devEnv.id} did not transition to one of the following statuses before timeout: "${status}"`
            )
        }
    }
})
