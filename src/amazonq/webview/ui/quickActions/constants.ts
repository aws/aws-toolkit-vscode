/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const QuickActionCommands = (weaverbirdEnabled: boolean) => [
    ...(weaverbirdEnabled
        ? [
              {
                  groupName: 'Project-level Application Development by Q',
                  commands: [
                      {
                          command: '/tests',
                          placeholder: 'Let Q write tests for your project',
                          description: 'Let Q write tests for your project',
                      },
                      {
                          command: '/dev',
                          placeholder: 'Describe a new feature or improvement',
                          description: 'Describe a new feature or improvement',
                      },
                      {
                          command: '/fix',
                          placeholder: 'Fix an issue across your project',
                          description: 'Fix an issue across your project',
                      },
                      {
                          command: '/transform',
                          description: 'Transform your Java 8 or 11 Maven project to Java 17',
                      },
                  ],
              },
          ]
        : []),
    {
        commands: [
            {
                command: '/clear',
                description: 'Clear this session',
            },
        ],
    },
]
