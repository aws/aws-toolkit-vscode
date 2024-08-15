/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { ToolkitError } from '../errors'

class Tool {
    public async installGui(): Promise<string | undefined> {
        throw new ToolkitError(`Not Implemented.`)
        return 'todo'
    }
}

export const tools: { [id: string]: Tool } = {
    aws: new Tool(),
    sam: new Tool(),
    docker: new Tool(),
}
