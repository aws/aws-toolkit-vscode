/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ChatItemContent, ChatItemType, MynahIcons, MynahUIDataModel } from '@aws/mynah-ui'

function createdTabbedData(examples: string[], agent: string): ChatItemContent['tabbedContent'] {
    const exampleText = examples.map((example) => `- ${example}`).join('\n')
    return [
        {
            label: 'Examples',
            value: 'examples',
            content: {
                body: `**Example use cases:**\n${exampleText}\n\nEnter ${agent} in Q Chat to get started`,
            },
        },
    ]
}

export const agentWalkthroughDataModel: MynahUIDataModel = {
    tabBackground: false,
    compactMode: false,
    tabTitle: 'Explore',
    promptInputVisible: false,
    tabHeaderDetails: {
        icon: MynahIcons.ASTERISK,
        title: 'Amazon Q Developer agents capabilities',
        description: '',
    },
    chatItems: [
        {
            type: ChatItemType.ANSWER,
            snapToTop: true,
            hoverEffect: true,
            body: `### Feature development
Implement features or make changes across your workspace, all from a single prompt.
`,
            icon: MynahIcons.CODE_BLOCK,
            footer: {
                tabbedContent: createdTabbedData(
                    [
                        '/dev update app.py to add a new api',
                        '/dev fix the <linting, compile, test> error',
                        '/dev add a new button to sort by <attribute>',
                    ],
                    '/dev'
                ),
            },
            buttons: [
                {
                    status: 'clear',
                    id: `user-guide-featuredev`,
                    disabled: false,
                    text: 'Read user guide',
                },
                {
                    status: 'main',
                    disabled: false,
                    flash: 'once',
                    fillState: 'hover',
                    icon: MynahIcons.RIGHT_OPEN,
                    id: 'quick-start-featuredev',
                    text: `Quick start with **/dev**`,
                },
            ],
        },
        {
            type: ChatItemType.ANSWER,
            hoverEffect: true,
            body: `### Unit test generation
Automatically generate unit tests for your active file.
`,
            icon: MynahIcons.BUG,
            footer: {
                tabbedContent: createdTabbedData(
                    ['Generate tests for specific functions', 'Generate tests for null and empty inputs'],
                    '/test'
                ),
            },
            buttons: [
                {
                    status: 'clear',
                    id: 'user-guide-testgen',
                    disabled: false,
                    text: 'Read user guide',
                },
                {
                    status: 'main',
                    disabled: false,
                    flash: 'once',
                    fillState: 'hover',
                    icon: MynahIcons.RIGHT_OPEN,
                    id: 'quick-start-testgen',
                    text: `Quick start with **/test**`,
                },
            ],
        },
        {
            type: ChatItemType.ANSWER,
            hoverEffect: true,
            body: `### Documentation generation
Create and update READMEs for better documented code.
`,
            icon: MynahIcons.CHECK_LIST,
            footer: {
                tabbedContent: createdTabbedData(
                    [
                        'Generate new READMEs for your project',
                        'Update existing READMEs with recent code changes',
                        'Request specific changes to a README',
                    ],
                    '/doc'
                ),
            },
            buttons: [
                {
                    status: 'clear',
                    id: 'user-guide-doc',
                    disabled: false,
                    text: 'Read user guide',
                },
                {
                    status: 'main',
                    disabled: false,
                    flash: 'once',
                    fillState: 'hover',
                    icon: MynahIcons.RIGHT_OPEN,
                    id: 'quick-start-doc',
                    text: `Quick start with **/doc**`,
                },
            ],
        },
        {
            type: ChatItemType.ANSWER,
            hoverEffect: true,
            body: `### Code reviews
Review code for issues, then get suggestions to fix your code instantaneously.
`,
            icon: MynahIcons.TRANSFORM,
            footer: {
                tabbedContent: createdTabbedData(
                    [
                        'Review code for security vulnerabilities and code quality issues',
                        'Get detailed explanations about code issues',
                        'Apply automatic code fixes to your files',
                    ],
                    '/review'
                ),
            },
            buttons: [
                {
                    status: 'clear',
                    id: 'user-guide-review',
                    disabled: false,
                    text: 'Read user guide',
                },
                {
                    status: 'main',
                    disabled: false,
                    flash: 'once',
                    fillState: 'hover',
                    icon: MynahIcons.RIGHT_OPEN,
                    id: 'quick-start-review',
                    text: `Quick start with **/review**`,
                },
            ],
        },
        {
            type: ChatItemType.ANSWER,
            hoverEffect: true,
            body: `### Transformation
Upgrade library and language versions in your codebase.
`,
            icon: MynahIcons.TRANSFORM,
            footer: {
                tabbedContent: createdTabbedData(
                    ['Upgrade Java language and dependency versions', 'Convert embedded SQL code in Java apps'],
                    '/transform'
                ),
            },
            buttons: [
                {
                    status: 'clear',
                    id: 'user-guide-gumby',
                    disabled: false,
                    text: 'Read user guide',
                },
                {
                    status: 'main',
                    disabled: false,
                    flash: 'once',
                    fillState: 'hover',
                    icon: MynahIcons.RIGHT_OPEN,
                    id: 'quick-start-gumby',
                    text: `Quick start with **/transform**`,
                },
            ],
        },
    ],
}
