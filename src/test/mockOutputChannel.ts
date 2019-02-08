/*!
 * Copyright 2018 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import { OutputChannel } from 'vscode'

export class MockOutputChannel implements OutputChannel {
  public value: string = ''
  public isHidden: boolean = false
  public preserveFocus: boolean = false

  public readonly name = 'Mock channel'

  public append(value: string): void {
    this.value += value
  }

  public appendLine(value: string) {
    this.value += value + '\n'
  }

  public clear(): void {
    this.value = ''
  }

  public dispose(): void {
    this.value = ''
  }

  public hide(): void {
    this.isHidden = true
  }

  public show(...args: any[] /* viewColumn?: ViewColumn, preserveFocus?: boolean */) {
    this.isHidden = true
    if (args && typeof args[0] === 'boolean') {
      this.preserveFocus = !!args[0] // Making linter happy
    }
  }
}
