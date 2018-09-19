'use strict'

import { AwsTreeProvider } from "./awsTreeProvider"
import { AwsContext } from "../awsContext"

export interface RefreshableAwsTreeProvider extends AwsTreeProvider {
    refresh(newContext?: AwsContext): void
}

