/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

export const QuickActionCommands = (weaverbirdEnabled: boolean) => [
    ...(weaverbirdEnabled
        ? [
              {
                  groupName: 'Start a workflow',
                  commands: [
                      {
                          command: '/dev',
                          placeholder: 'Enter the coding task in details',
                          description: 'Assign Q a coding task',
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
