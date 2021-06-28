/*!
 * Copyright 2021 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { RuleTester } from 'eslint'
import { rules } from '../../'

const ruleTester = new RuleTester({
    parserOptions: { ecmaVersion: 2016 },
})
const expectedErrorMessage = 'No "AWS" in localize calls'
const errors = [expectedErrorMessage]
const expectedFunction = 'getIdeProperties().company'

ruleTester.run('no-localize-aws', rules['no-localize-aws'], {
    valid: [
        "localize('key', '')",
        "localize('key', 'Awsssss')",
        "localize('AWS.key', 'the artist draws')",
        "localize('AWS.key', 'the artist drew a {0}', 'cat')",
        "localize('key', 'create a new {0} using AWS, service')",
    ],

    invalid: [
        {
            code: "localize('key', 'AWS')",
            errors,
            output: `localize('key', '{0}', ${expectedFunction})`,
        },
        {
            code: "localize('key', 'my string at AWS')",
            errors,
            output: `localize('key', 'my string at {0}', ${expectedFunction})`,
        },
        {
            code: "localize('key', 'a service by AWS and a resource by AWS')",
            errors,
            output: `localize('key', 'a service by {0} and a resource by {0}', ${expectedFunction})`,
        },
        {
            code: "localize('key', 'create a new {0} using AWS', 'resource')",
            errors,
            output: `localize('key', 'create a new {0} using {1}', 'resource', ${expectedFunction})`,
        },
        {
            code: "localize('key', 'using AWS, create a new {0}', 'resource')",
            errors,
            output: `localize('key', 'using {0}, create a new {1}', ${expectedFunction}, 'resource')`,
        },
        {
            code: "localize('key', 'using AWS, create a new {0} by using AWS', 'resource')",
            errors,
            output: `localize('key', 'using {0}, create a new {1} by using {0}', ${expectedFunction}, 'resource')`,
        },
        {
            code: "localize('key', 'create a new {0}, AWS {1} and {2} by using AWS', 'resource', 'service', 'resource')",
            errors,
            output: `localize('key', 'create a new {0}, {1} {2} and {3} by using {1}', 'resource', ${expectedFunction}, 'service', 'resource')`,
        },
        {
            code: "localize(\n\t'key',\n\t'using AWS, create a new {0} by using AWS',\n\t'resource')",
            errors,
            output: `localize(\n\t'key',\n\t'using {0}, create a new {1} by using {0}',\n\t${expectedFunction},\n\t'resource')`,
        },
    ],
})
