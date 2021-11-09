/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vscode from 'vscode'
import { EcrRepositoryWizard } from '../../../../shared/ui/common/ecrRepository'
import { createWizardTester, WizardTester } from '../../wizards/wizardTestUtils'
import { mock, when, instance, anything } from 'ts-mockito'
import { DefaultEcrClient, EcrClient, EcrRepository } from '../../../../shared/clients/ecrClient'
import { createQuickPickTester } from '../testUtils'

function createRepo(name: string): EcrRepository {
    return {
        repositoryArn: 'arn', // TODO: make this a 'real' ARN
        repositoryName: name,
        repositoryUri: `123456789012.dkr.ecr.us-east-1.amazonaws.com/${name}`,
    }
}

describe('EcrRepositoryWizard', function () {
    let tester: WizardTester<EcrRepositoryWizard>
    let ecrClient: EcrClient
    let repositories: EcrRepository[]
    let tags: Record<string, string[]>

    beforeEach(function () {
        repositories = [createRepo('repo1')]
        tags = { repo1: ['latest', 'not-latest'] }
        ecrClient = mock(DefaultEcrClient)
        tester = createWizardTester(new EcrRepositoryWizard(instance(ecrClient)))

        when(ecrClient.describeRepositories()).thenCall(async function* () {
            yield* repositories
        })
        when(ecrClient.describeTags(anything())).thenCall(async function* (name) {
            yield* tags[name] ?? []
        })
    })

    it('asks for tag if not provided', async function () {
        tester.repo.assertShow()
        tester.repo.tag.assertDoesNotShow()

        await tester.repo.runPrompt(prompter => {
            const tester = createQuickPickTester(prompter)
            tester.assertItems(['repo1'])
            tester.acceptItem('repo1')
            return tester
        })

        tester.repo.tag.assertShow()
    })

    it('lists tags for the assigned repo', async function () {
        tester.repo.applyInput(repositories[0] as any)

        await tester.repo.tag.runPrompt(prompter => {
            const tester = createQuickPickTester(prompter)
            tester.assertItems(['latest', 'not-latest'])
            tester.acceptItem('latest')
            return tester
        })

        tester.assertShowCount(0)
    })

    it('uses tag if provided by the filter box', async function () {
        // TODO: see if we can get filter box tests to work on min-ver somehow
        if (vscode.version.startsWith('1.44')) {
            this.skip()
        }

        await tester.repo.runPrompt(prompter => {
            const input = createRepo('my-repo')
            const tester = createQuickPickTester(prompter)
            tester.setFilter(`${input.repositoryUri}:my-tag`)
            tester.acceptItem('ECR URL') // derived from `customUserInputLabel
            return tester
        })

        tester.repo.tag.assertValue('my-tag')
    })

    it('can refresh repositories with filter box input applied', async function () {
        if (vscode.version.startsWith('1.44')) {
            this.skip()
        }

        await tester.repo.runPrompt(prompter => {
            const input = createRepo('repo')
            const tester = createQuickPickTester(prompter, { forceEmits: true })
            tester.setFilter(`${input.repositoryUri}`)
            tester.addCallback(() => repositories.push(createRepo('my-repo')))
            tester.pressButton('Refresh')
            tester.assertItems(['repo1'])
            // TODO: should we preserve the filter box item on a refresh?
            // probably, but that does require some extra logic
            //tester.assertItems(['ECR URL', 'repo1'])
            tester.setFilter(undefined)
            tester.assertItems(['repo1', 'my-repo'])
            tester.acceptItem('my-repo')
            return tester
        })

        tester.repo.repositoryName.assertValue('my-repo')
    })
})
