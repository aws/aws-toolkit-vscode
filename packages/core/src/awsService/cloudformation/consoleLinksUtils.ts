/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
export function arnToConsoleUrl(arn: string): string {
    return `https://console.aws.amazon.com/go/view?arn=${encodeURIComponent(arn)}`
}

export function arnToConsoleTabUrl(arn: string, tab: 'resources' | 'events' | 'outputs'): string {
    const region = arn.split(':')[3]
    return `https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}#/stacks/${tab}?stackId=${encodeURIComponent(arn)}`
}

export function operationIdToConsoleUrl(arn: string, operationId: string): string {
    const region = arn.split(':')[3]
    return `https://${region}.console.aws.amazon.com/cloudformation/home?region=${region}#/stacks/operations/info?stackId=${encodeURIComponent(arn)}&operationId=${operationId}`
}

// Reference link - https://cloudscape.design/foundation/visual-foundation/iconography/ - icon name: external
export function externalLinkSvg(): string {
    return `<svg width="14" height="14" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M4 12.0117H11.0098V14.0117H3C2.44772 14.0117 2 13.564 2 13.0117V5.01172H4V12.0117Z"/><path d="M13 2.01172C13.5523 2.01172 14 2.45943 14 3.01172V9.01172H12V5.43066L7.70605 9.71777L6.29395 8.30273L10.5908 4.01172H7V2.01172H13Z"/></svg>`
}

export const consoleLinkStyles = `
.console-link {
    display: inline-flex;
    align-items: center;
    opacity: 0.8;
    transition: opacity 0.2s;
    line-height: 1;
}
.console-link:hover {
    opacity: 1;
}
.console-link svg path {
    fill: #007ACC;
}
`
