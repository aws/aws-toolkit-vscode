/*!
 * Copyright 2022 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

import * as vs from 'vscode'
import { NotificationInfoStore } from '../../stores/notificationsInfoStore'
import { getSimpleAndFqnNames } from '../../utils/document'
import { mynahSelectedCodeDecorator } from '../../decorations/selectedCode'
import { telemetry } from '../../../shared/telemetry/telemetry'
export class OnDidOpenTextDocumentNotificationsProcessor {
    constructor(private readonly notificationInfoStore: NotificationInfoStore) {}

    readonly apiHelpGuideNotificationName = 'api_help_guide'

    private async checkAPIHelpNotificationStatus(): Promise<boolean> {
        const notificationInfo = await this.notificationInfoStore.getRecordFromGlobalStore(
            this.apiHelpGuideNotificationName
        )

        if (notificationInfo === undefined) {
            return true
        }

        if (notificationInfo.muted) {
            return false
        }

        const currentDate = new Date().getTime()
        const datesMinutesDiff = Math.ceil(Math.abs(currentDate - notificationInfo.lastSeen) / 60000)

        // Can be changed to configure the time after notification will be showed again
        if (datesMinutesDiff < 0) {
            return false
        }

        return true
    }

    private async showAPIHelpNotification(d: vs.TextDocument): Promise<void> {
        if (!(await this.checkAPIHelpNotificationStatus())) {
            return
        }

        await getSimpleAndFqnNames(d).then(async names => {
            if (names.fullyQualified === undefined) {
                return
            }
            const lines: Set<number> = new Set()
            names.fullyQualified.usedSymbols.forEach(function (elem: any) {
                let hasSymbolLongerThanOne = false
                elem.symbol.forEach(function (elem: any) {
                    const trimmedElem = elem.trim()
                    if (trimmedElem.length > 1) {
                        hasSymbolLongerThanOne = true
                    }
                })
                if (!hasSymbolLongerThanOne) {
                    return
                }

                // eslint-disable-next-line @typescript-eslint/restrict-plus-operands
                for (let i = elem.extent.start.line; i < elem.extent.end.line + 1; i++) {
                    lines.add(i)
                }
            })

            if (lines.size === 0) {
                return
            }

            const linesArr: number[] = Array.from(lines)
            let anchor = 0
            const ranges: number[][] = []
            for (let i = 0; i < linesArr.length; i++) {
                if (i > 0 && linesArr[i] !== linesArr[i - 1] + 1) {
                    ranges.push([linesArr[anchor], linesArr[i - 1]])
                    anchor = i
                }
            }
            ranges.push([linesArr[anchor], linesArr[linesArr.length - 1]])

            const startButtonName = 'Yes!'
            const declineButtonName = 'No'
            const muteButtonName = 'Do not show again'
            await vs.window
                .showInformationMessage(
                    'Would you like Mynah to find resources and usage examples for APIs used in your code?',
                    startButtonName,
                    declineButtonName,
                    muteButtonName
                )
                .then(async selection => {
                    if (selection === muteButtonName) {
                        telemetry.mynah_actOnNotification.emit({
                            mynahContext: JSON.stringify({
                                notificationMetadata: {
                                    name: this.apiHelpGuideNotificationName,
                                    action: muteButtonName,
                                },
                            }),
                        })

                        await this.notificationInfoStore.setMuteStatusForNotificationInGlobalStore(
                            this.apiHelpGuideNotificationName,
                            true
                        )
                        return
                    }
                    if (selection === declineButtonName) {
                        telemetry.mynah_actOnNotification.emit({
                            mynahContext: JSON.stringify({
                                notificationMetadata: {
                                    name: this.apiHelpGuideNotificationName,
                                    action: declineButtonName,
                                },
                            }),
                        })
                        return
                    }
                    if (selection === startButtonName) {
                        telemetry.mynah_actOnNotification.emit({
                            mynahContext: JSON.stringify({
                                notificationMetadata: {
                                    name: this.apiHelpGuideNotificationName,
                                    action: startButtonName,
                                },
                            }),
                        })

                        const decorations: any = []
                        ranges.slice(0, 3).forEach(function (range: any) {
                            decorations.push({
                                range: new vs.Range(
                                    new vs.Position(range[0], 0),
                                    new vs.Position(
                                        range[1],
                                        vs.window.activeTextEditor?.document.lineAt(range[1]).range.end.character ?? 0
                                    )
                                ),
                            })
                        })

                        vs.window.activeTextEditor?.setDecorations(mynahSelectedCodeDecorator, decorations)
                    }
                })

            await this.notificationInfoStore.addNewViewToNotificationInGlobalStore(this.apiHelpGuideNotificationName)
            telemetry.mynah_viewNotification.emit({
                mynahContext: JSON.stringify({
                    notificationMetadata: {
                        name: this.apiHelpGuideNotificationName,
                    },
                }),
            })
        })
    }

    public async process(d: vs.TextDocument): Promise<void> {
        await this.showAPIHelpNotification(d)
    }
}
