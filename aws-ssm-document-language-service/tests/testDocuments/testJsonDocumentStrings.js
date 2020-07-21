'use strict'
Object.defineProperty(exports, '__esModule', { value: true })
exports.documentContainsComplicateCycle = exports.documentContainsSize2Cycle = exports.documentMissingActionValue = exports.documentMissingAction = exports.documentMissingMultipleElementsUnderParameters = exports.documentMissingOneElementUnderParameters = exports.documentMissingParameters = exports.documentNoDoubleBracket = void 0
exports.documentNoDoubleBracket = {
    text: `
    {
        "schemaVersion": "2.2",
        "mainSteps": [
            {
                "action": "aws:applications",
                "name": "example",
                "inputs": {
                    "action": "Install",
                    "source": "source"
                }
            }
        ],
        "assumeRole": "sdf"
    }`,
    diagnostics: [],
}
exports.documentMissingParameters = {
    text: `
    {
        "schemaVersion": "2.2",
        "mainSteps": [
            {
                "action": "aws:applications",
                "name": "example",
                "inputs": {
                    "action": "Install",
                    "source": "{{ source }}"
                }
            }
        ],
        "assumeRole": "sdf"
    }`,
    diagnostics: [
        {
            message: 'Missing required property "parameters".',
            start: [9, 31],
            end: [9, 43],
        },
    ],
}
exports.documentMissingOneElementUnderParameters = {
    text: `
    {
        "schemaVersion": "2.2",
        "mainSteps": [
            {
                "action": "aws:applications",
                "name": "example",
                "inputs": {
                    "action": "Install",
                    "source": "{{ source }}"
                }
            }
        ],
        "assumeRole": "sdf",
        "parameters": {

        }
    }`,
    diagnostics: [
        {
            message: 'Missing required property source under "parameters". source should be a parameter.',
            start: [9, 31],
            end: [9, 43],
        },
    ],
}
exports.documentMissingMultipleElementsUnderParameters = {
    text: `
    {
        "schemaVersion": "2.2",
        "mainSteps": [
            {
                "action": "aws:applications",
                "name": "example",
                "inputs": {
                    "action": "Install",
                    "source": "{{ source }}",
                    "sourceHash": "{{ sourceHash }}"
                }
            }
        ],
        "assumeRole": "sdf",
        "parameters": {
            "notuse": {
                "type": "String"
            }
        }
    }`,
    diagnostics: [
        {
            message: 'Missing required property source under "parameters". source should be a parameter.',
            start: [9, 31],
            end: [9, 43],
        },
        {
            message: 'Missing required property sourceHash under "parameters". sourceHash should be a parameter.',
            start: [10, 35],
            end: [10, 51],
        },
    ],
}
exports.documentMissingAction = {
    text: `{
        "schemaVersion": "0.3",
        "mainSteps": [
            {
                "name": "forceStopEC2RescueInstance",
                "action": "aws:changeInstanceState",
                "onFailure": "Continue",
                "inputs": {
                  "InstanceIds": [
                    "{{ describeEC2RescueInstance.EC2RescueInstanceId }}"
                  ],
                  "CheckStateOnly": false,
                  "DesiredState": "stopped",
                  "Force": true
                },
                "isCritical": "true",
                "nextStep": "detachInstanceRootVolumeFromEC2RescueInstance"
            }
        ]
    }`,
    diagnostics: [
        {
            message: 'Cannot find action describeEC2RescueInstance',
            start: [9, 21],
            end: [9, 72],
        },
    ],
}
exports.documentMissingActionValue = {
    text: `{
        "schemaVersion": "0.3",
        "mainSteps": [
            {
                "name": "forceStopEC2RescueInstance",
                "action": "aws:changeInstanceState",
                "onFailure": "Continue",
                "inputs": {
                    "InstanceIds": [
                        "{{ describeEC2RescueInstance.EC2RescueInstanceId }}"
                    ],
                    "DesiredState": "stopped"
                }
            },
            {
                "name": "describeEC2RescueInstance",
                "action": "aws:executeAwsApi",
                "onFailure": "step:unstageEC2RescueAutomation",
                "inputs": {
                  "Service": "cloudformation",
                  "Api": "DescribeStacks"
                },
                "isCritical": "true",
                "nextStep": "waitForEC2RescueInstanceToBeManaged"
            }
        ]
    }`,
    diagnostics: [
        {
            message: 'Cannot find property EC2RescueInstanceId of action describeEC2RescueInstance',
            start: [9, 25],
            end: [9, 76],
        },
    ],
}
exports.documentContainsSize2Cycle = {
    text: `{
        "schemaVersion": "0.3",
        "mainSteps": [
            {
                "name": "pause1",
                "action": "aws:pause",
                "inputs": {},
                "nextStep": "pause2"
            },
            {
                "name": "pause2",
                "action": "aws:pause",
                "inputs": {},
                "nextStep": "pause1"
            }
        ]
    }`,
    diagnostics: [
        {
            message: 'Action steps contain cycles.',
            start: [2, 9],
            end: [2, 18],
        },
    ],
}
exports.documentContainsComplicateCycle = {
    text: `{
        "schemaVersion": "0.3",
        "mainSteps": [
            {
                "name": "pause1",
                "action": "aws:pause",
                "inputs": {},
                "nextStep": "pause3"
            },
            {
                "name": "pause2",
                "action": "aws:pause",
                "inputs": {},
                "nextStep": "pause4"
            },
            {
                "name": "pause3",
                "action": "aws:pause",
                "inputs": {},
                "nextStep": "pause2"
            },
            {
                "name": "pause4",
                "action": "aws:pause",
                "inputs": {},
                "nextStep": "pause1"
            }
        ]
    }`,
    diagnostics: [
        {
            message: 'Action steps contain cycles.',
            start: [2, 9],
            end: [2, 18],
        },
    ],
}
//# sourceMappingURL=testJsonDocumentStrings.js.map
