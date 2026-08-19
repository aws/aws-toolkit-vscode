/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert'
import * as vscode from 'vscode'
import * as path from 'path'
import * as os from 'os'
import { mkdtemp, rm, writeFile } from 'fs/promises'

describe('CloudFormation LSP Integration E2E', function () {
    let testDir: string

    before(async function () {
        const envPath = process.env.__CLOUDFORMATIONLSP_PATH
        console.log(`__CLOUDFORMATIONLSP_PATH = ${envPath}`)

        if (envPath) {
            console.log(`Using local LSP server from: ${envPath}`)
        } else {
            console.log('No __CLOUDFORMATIONLSP_PATH set, will download LSP from GitHub')
        }

        const extension = vscode.extensions.getExtension('amazonwebservices.aws-toolkit-vscode')
        console.log(`Extension found: ${!!extension}, isActive: ${extension?.isActive}`)
        if (extension && !extension.isActive) {
            console.log('Activating extension...')
            await extension.activate()
            console.log('Extension activated')
        }

        testDir = await mkdtemp(path.join(os.tmpdir(), 'cfn-lsp-test-'))
        console.log('Waiting for LSP server to be ready...')
        await waitForLspReady()
        console.log('LSP server is ready')
    })

    /**
     * Poll for LSP readiness by opening a CFN document with independent resource
     * type and property completion positions. Require both the exact resource type
     * and property used by the E2E assertions so generic/YAML word completion cannot
     * produce a false positive before CloudFormation schemas are ready.
     * Times out with a diagnostic message after a bounded period.
     */
    async function waitForLspReady(): Promise<void> {
        const readinessTimeoutMs = 30_000
        const pollIntervalMs = 500
        const probeContent = [
            'AWSTemplateFormatVersion: "2010-09-09"',
            'Resources:',
            '  TypeProbe:',
            '    Type: ',
            '  PropertyProbe:',
            '    Type: AWS::S3::Bucket',
            '    Properties:',
            '      ',
        ].join('\n')
        const probeFile = path.join(testDir, '__lsp_readiness_probe.yaml')

        await writeFile(probeFile, probeContent, 'utf-8')
        const probeUri = vscode.Uri.file(probeFile)
        const probeDoc = await vscode.workspace.openTextDocument(probeUri)
        await vscode.window.showTextDocument(probeDoc)

        const typePosition = new vscode.Position(3, 10)
        const propertyPosition = new vscode.Position(7, 6)
        const deadline = Date.now() + readinessTimeoutMs
        let ready = false
        let lastTypeLabels: string[] = []
        let lastPropertyLabels: string[] = []

        const completionLabels = (completions: vscode.CompletionList | undefined): string[] =>
            completions?.items.map((item) => (typeof item.label === 'string' ? item.label : item.label.label)) ?? []

        try {
            while (Date.now() < deadline) {
                const typeCompletions = await vscode.commands.executeCommand<vscode.CompletionList>(
                    'vscode.executeCompletionItemProvider',
                    probeUri,
                    typePosition
                )
                const propertyCompletions = await vscode.commands.executeCommand<vscode.CompletionList>(
                    'vscode.executeCompletionItemProvider',
                    probeUri,
                    propertyPosition
                )

                lastTypeLabels = completionLabels(typeCompletions)
                lastPropertyLabels = completionLabels(propertyCompletions)

                const hasResourceType = lastTypeLabels.some((label) => label.includes('AWS::AccessAnalyzer::Analyzer'))
                const hasProperty = lastPropertyLabels.some((label) => label.includes('BucketName'))
                if (hasResourceType && hasProperty) {
                    ready = true
                    break
                }

                await new Promise((resolve) => setTimeout(resolve, pollIntervalMs))
            }
        } finally {
            await vscode.window.showTextDocument(probeDoc)
            await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
        }

        if (!ready) {
            assert.fail(
                `LSP server did not become schema-ready within ${readinessTimeoutMs}ms. ` +
                    `Expected resource type AWS::AccessAnalyzer::Analyzer and property BucketName. ` +
                    `Last type labels: [${lastTypeLabels.slice(0, 15).join(', ')}]. ` +
                    `Last property labels: [${lastPropertyLabels.slice(0, 15).join(', ')}]`
            )
        }
    }

    after(async function () {
        await vscode.commands.executeCommand('workbench.action.closeAllEditors')
        try {
            await rm(testDir, { recursive: true, force: true })
        } catch (error) {
            console.warn('Failed to clean up test directory:', error)
        }
    })

    async function createTestFile(
        filename: string,
        content: string
    ): Promise<{ uri: vscode.Uri; doc: vscode.TextDocument }> {
        const filePath = path.join(testDir, filename)
        await writeFile(filePath, content, 'utf-8')
        const uri = vscode.Uri.file(filePath)
        const doc = await vscode.workspace.openTextDocument(uri)
        await vscode.window.showTextDocument(doc)
        await new Promise((resolve) => setTimeout(resolve, 500))
        return { uri, doc }
    }

    async function closeDocument(doc: vscode.TextDocument): Promise<void> {
        await vscode.window.showTextDocument(doc)
        await vscode.commands.executeCommand('workbench.action.closeActiveEditor')
    }

    describe('Autocomplete', function () {
        it('should provide autocomplete for CloudFormation top-level sections', async function () {
            const content = 'AWSTemplateFormatVersion: "2010-09-09"\n'
            const { uri, doc } = await createTestFile('top-level.yaml', content)

            const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
                'vscode.executeCompletionItemProvider',
                uri,
                new vscode.Position(1, 0)
            )

            assert.ok(completions, 'Should receive completion items')
            assert.ok(completions.items.length > 0, 'Should have completion items')

            const labels = completions.items.map((i) => (typeof i.label === 'string' ? i.label : i.label.label))
            const cfnSections = ['Description', 'Resources', 'Parameters', 'Outputs', 'Metadata']
            const found = labels.filter((label) => cfnSections.some((section) => label.includes(section)))

            assert.ok(found.length > 0, `Should have CloudFormation sections. Got: ${labels.join(', ')}`)
            await closeDocument(doc)
        })

        it('should provide autocomplete for resource types', async function () {
            const content = `AWSTemplateFormatVersion: "2010-09-09"
Resources:
  MyBucket:
    Type: `
            const { uri, doc } = await createTestFile('resource-type.yaml', content)

            const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
                'vscode.executeCompletionItemProvider',
                uri,
                new vscode.Position(3, 10)
            )

            assert.ok(completions, 'Should receive completion items')
            const labels = completions.items.map((i) => (typeof i.label === 'string' ? i.label : i.label.label))
            const hasResourceType = labels.some((label) => label.includes('AWS::AccessAnalyzer::Analyzer'))

            assert.ok(
                hasResourceType,
                `Should have resource types in completions. Got: ${labels.slice(0, 10).join(', ')}`
            )
            await closeDocument(doc)
        })

        it('should provide autocomplete for resource properties', async function () {
            const content = `AWSTemplateFormatVersion: "2010-09-09"
Resources:
  MyBucket:
    Type: AWS::S3::Bucket
    Properties:
      `
            const { uri, doc } = await createTestFile('resource-props.yaml', content)

            const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
                'vscode.executeCompletionItemProvider',
                uri,
                new vscode.Position(5, 6)
            )

            assert.ok(completions, 'Should receive completion items')
            const labels = completions.items.map((i) => (typeof i.label === 'string' ? i.label : i.label.label))
            const hasBucketName = labels.some((label) => label.includes('BucketName'))

            assert.ok(hasBucketName, `Should have BucketName in completions. Got: ${labels.join(', ')}`)
            await closeDocument(doc)
        })

        it('should provide autocomplete for intrinsic functions', async function () {
            const content = `AWSTemplateFormatVersion: "2010-09-09"
Parameters:
  MyParam:
    Type: String
Resources:
  MyBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !`
            const { uri, doc } = await createTestFile('intrinsic.yaml', content)

            const completions = await vscode.commands.executeCommand<vscode.CompletionList>(
                'vscode.executeCompletionItemProvider',
                uri,
                new vscode.Position(8, 19)
            )

            assert.ok(completions, 'Should receive completion items')
            const labels = completions.items.map((i) => (typeof i.label === 'string' ? i.label : i.label.label))
            const hasRef = labels.some((label) => label.includes('Ref'))

            assert.ok(hasRef, `Should have Ref in completions. Got: ${labels.join(', ')}`)
            await closeDocument(doc)
        })
    })

    describe('Hover', function () {
        it('should provide hover documentation for resource types', async function () {
            const content = `AWSTemplateFormatVersion: "2010-09-09"
Resources:
  MyBucket:
    Type: AWS::S3::Bucket`
            const { uri, doc } = await createTestFile('hover-resource.yaml', content)

            const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
                'vscode.executeHoverProvider',
                uri,
                new vscode.Position(3, 15)
            )

            assert.ok(hovers && hovers.length > 0, 'Should receive hover information')
            const hoverText = hovers[0].contents.map((c) => (typeof c === 'string' ? c : c.value)).join(' ')
            assert.ok(hoverText.length > 0, 'Hover should contain documentation')
            await closeDocument(doc)
        })

        it('should provide hover documentation for properties', async function () {
            const content = `AWSTemplateFormatVersion: "2010-09-09"
Resources:
  MyBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: my-bucket`
            const { uri, doc } = await createTestFile('hover-property.yaml', content)

            const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
                'vscode.executeHoverProvider',
                uri,
                new vscode.Position(5, 10)
            )

            assert.ok(hovers && hovers.length > 0, 'Should receive hover information')
            await closeDocument(doc)
        })

        it('should provide hover documentation for intrinsic functions', async function () {
            const content = `AWSTemplateFormatVersion: "2010-09-09"
Parameters:
  MyParam:
    Type: String
Resources:
  MyBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Ref MyParam`
            const { uri, doc } = await createTestFile('hover-intrinsic.yaml', content)

            const hovers = await vscode.commands.executeCommand<vscode.Hover[]>(
                'vscode.executeHoverProvider',
                uri,
                new vscode.Position(8, 20)
            )

            assert.ok(hovers && hovers.length > 0, 'Should receive hover information for !Ref')
            await closeDocument(doc)
        })
    })

    describe('Definition', function () {
        it('should navigate to parameter definition from Ref', async function () {
            const content = `AWSTemplateFormatVersion: "2010-09-09"
Parameters:
  MyParam:
    Type: String
Resources:
  MyBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: !Ref MyParam`
            const { uri, doc } = await createTestFile('definition-param.yaml', content)

            const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeDefinitionProvider',
                uri,
                new vscode.Position(8, 25)
            )

            assert.ok(definitions && definitions.length > 0, 'Should find parameter definition')
            assert.strictEqual(definitions[0].uri.toString(), uri.toString(), 'Definition should be in same file')
            await closeDocument(doc)
        })

        it('should navigate to resource definition from GetAtt', async function () {
            const content = `AWSTemplateFormatVersion: "2010-09-09"
Resources:
  MyBucket:
    Type: AWS::S3::Bucket
  MyTopic:
    Type: AWS::SNS::Topic
    Properties:
      DisplayName: !GetAtt MyBucket.Arn`
            const { uri, doc } = await createTestFile('definition-resource.yaml', content)

            const definitions = await vscode.commands.executeCommand<vscode.Location[]>(
                'vscode.executeDefinitionProvider',
                uri,
                new vscode.Position(7, 30)
            )

            assert.ok(definitions && definitions.length > 0, 'Should find resource definition')
            await closeDocument(doc)
        })
    })

    describe('Document Symbols', function () {
        it('should provide document outline with resources', async function () {
            const content = `AWSTemplateFormatVersion: "2010-09-09"
Description: Test template
Parameters:
  MyParam:
    Type: String
Resources:
  MyBucket:
    Type: AWS::S3::Bucket
  MyTopic:
    Type: AWS::SNS::Topic
Outputs:
  BucketName:
    Value: !Ref MyBucket`
            const { uri, doc } = await createTestFile('symbols.yaml', content)

            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                uri
            )

            assert.ok(symbols && symbols.length > 0, 'Should receive document symbols')
            const symbolNames = symbols.map((s) => s.name)
            assert.ok(
                symbolNames.some((name) => name.includes('Resources') || name.includes('MyBucket')),
                `Should have Resources or resource names in symbols. Got: ${symbolNames.join(', ')}`
            )
            await closeDocument(doc)
        })

        it('should provide hierarchical symbols for nested structures', async function () {
            const content = `AWSTemplateFormatVersion: "2010-09-09"
Resources:
  MyBucket:
    Type: AWS::S3::Bucket
    Properties:
      BucketName: my-bucket
      Tags:
        - Key: Name
          Value: MyBucket`
            const { uri, doc } = await createTestFile('symbols-nested.yaml', content)

            const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
                'vscode.executeDocumentSymbolProvider',
                uri
            )

            assert.ok(symbols && symbols.length > 0, 'Should receive document symbols')
            await closeDocument(doc)
        })
    })
})
