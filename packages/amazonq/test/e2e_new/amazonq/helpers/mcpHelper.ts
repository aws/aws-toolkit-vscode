/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */
import { WebviewView, By, WebElement } from 'vscode-extension-tester'
import { clickButton, sleep, waitForElement } from '../utils/generalUtils'

/**
 * Clicks the tools to get to the MCP server overlay
 * @param webviewView The WebviewView instance
 * @returns Promise<boolean> True if tools button was found and clicked, false otherwise
 */
export async function clickToolsButton(webviewView: WebviewView): Promise<void> {
    try {
        await clickButton(
            webviewView,
            '[data-testid="tab-bar-buttons-wrapper"]',
            '[data-testid="tab-bar-button"] .mynah-ui-icon-tools',
            'tools button'
        )
    } catch (e) {
        throw new Error(`Failed to click tools button: ${e}`)
    }
}

/**
 * Clicks the add button in the MCP server configuration panel
 * @param webviewView The WebviewView instance
 * @returns Promise<boolean> True if add button was found and clicked, false otherwise
 */
export async function clickMCPAddButton(webviewView: WebviewView): Promise<void> {
    try {
        await clickButton(
            webviewView,
            '.mynah-sheet-header-actions-container',
            'i.mynah-ui-icon-plus',
            'MCP add button'
        )
    } catch (e) {
        throw new Error(`Failed to click MCP add button: ${e}`)
    }
}

/**
 * Configures an MCP server with the provided settings
 * @param webviewView The WebviewView instance
 * @param config Configuration object with optional parameters
 * @returns Promise<boolean> True if configuration was successful, false otherwise
 * Note: I have the default settings in the defaultConfig
 */
interface MCPServerConfig {
    scope?: 'global' | 'workspace'
    name?: string
    transport?: number
    command?: string
    args?: string[]
    url?: string
    environmentVariable?: { name: string; value: string }
    timeout?: number
}

const defaultConfig: MCPServerConfig = {
    scope: 'global',
    name: 'aws-documentation',
    transport: 0,
    command: 'uvx',
    args: ['awslabs.aws-documentation-mcp-server@latest'],
    timeout: 0,
}

export const remoteFetchConfig: MCPServerConfig = {
    scope: 'global',
    name: 'remote-fetch',
    transport: 1,
    url: 'https://remote.mcpservers.org/fetch/mcp',
    timeout: 0,
}

// Each name maps to an index in the '.mynah-form-input-wrapper' array
const formItemsMap = {
    SCOPE: 0,
    NAME: 1,
    TRANSPORT: 2,
    COMMAND: 3,
    ARGS: 4,
    URL: 3,
    ENV_VARS: 6,
    TIMEOUT: 9,
} as const

type McpFormItem = keyof typeof formItemsMap

async function selectScope(container: WebElement, scope: string) {
    try {
        const radioLabels = await container.findElements(
            By.css('.mynah-form-input-radio-label.mynah-ui-clickable-item')
        )
        if (scope === 'global') {
            const globalOption = radioLabels[0]
            await globalOption.click()
        } else {
            const workspaceOption = radioLabels[1]
            await workspaceOption.click()
        }
    } catch (e) {
        console.error('Error selecting the scope:', e)
        throw e
    }
}

async function inputName(container: WebElement, name: string) {
    try {
        const input = await container.findElement(By.css('.mynah-form-input'))
        await input.sendKeys(name)
    } catch (e) {
        console.error('Error inputing the name:', e)
        throw e
    }
}

async function selectTransport(container: WebElement, transport: number) {
    try {
        const selectElement = await container.findElement(By.css('select'))
        const options = await selectElement.findElements(By.css('option'))
        const optionIndex = transport
        await options[optionIndex].click()
    } catch (e) {
        console.error('Error selecting the transport:', e)
        throw e
    }
}

async function inputCommand(container: WebElement, command: string) {
    try {
        const input = await container.findElement(By.css('.mynah-form-input'))
        await input.sendKeys(command)
    } catch (e) {
        console.error('Error inputing the command:', e)
        throw e
    }
}

async function inputArgs(container: WebElement, args: string[]) {
    try {
        const input = await container.findElement(By.css('.mynah-form-input'))
        const addButton = await container.findElement(By.css('.mynah-form-item-list-add-button'))
        for (let i = 0; i < args.length; i++) {
            await input.sendKeys(args[i])
            await addButton.click()
        }
    } catch (e) {
        console.error('Error inputing the arguments:', e)
        throw e
    }
}

async function inputEnvironmentVariables(container: WebElement, environmentVariable?: { name: string; value: string }) {
    try {
        if (environmentVariable) {
            const envInputs = await container.findElements(By.css('.mynah-form-input'))
            await envInputs[0].sendKeys(environmentVariable.name)
            await envInputs[1].sendKeys(environmentVariable.value)
            const addButton = await container.findElement(By.css('.mynah-form-item-list-add-button'))
            await addButton.click()
        } else {
            console.log('No environmental variables for this configuration')
        }
    } catch (e) {
        console.error('Error inputing the environment variables:', e)
        throw e
    }
}

async function inputTimeout(container: WebElement, timeout: number) {
    try {
        const input = await container.findElement(By.css('.mynah-form-input'))
        await input.clear()
        await input.sendKeys(timeout.toString())
    } catch (e) {
        console.error('Error inputing the timeout:', e)
        throw e
    }
}

async function inputUrl(container: WebElement, url: string) {
    try {
        const input = await container.findElement(By.css('.mynah-form-input'))
        await input.clear()
        await input.click()
        await sleep(200)
        await input.sendKeys(url)
    } catch (e) {
        console.error('Error inputing the URL:', e)
        throw e
    }
}

async function processFormItem(mcpFormItem: McpFormItem, container: WebElement, config: MCPServerConfig) {
    switch (mcpFormItem) {
        case 'SCOPE':
            await selectScope(container, config.scope!)
            break
        case 'NAME':
            await inputName(container, config.name!)
            break
        case 'TRANSPORT':
            await selectTransport(container, config.transport!)
            break
        case 'COMMAND':
            if (config.command) {
                await inputCommand(container, config.command)
            }
            break
        case 'ARGS':
            if (config.args) {
                await inputArgs(container, config.args)
            }
            break
        case 'URL':
            if (config.url) {
                await inputUrl(container, config.url)
            }
            break
        case 'ENV_VARS':
            await inputEnvironmentVariables(container, config.environmentVariable)
            break
        case 'TIMEOUT':
            await inputTimeout(container, config.timeout!)
            break
    }
}

async function getFormContainer(sheetWrapper: WebElement) {
    const sheetBody = await sheetWrapper.findElement(By.css('.mynah-sheet-body'))
    const filtersWrapper = await sheetBody.findElement(By.css('.mynah-detailed-list-filters-wrapper'))
    return await filtersWrapper.findElement(By.css('.mynah-chat-item-form-items-container'))
}

export async function configureMCPServer(webviewView: WebviewView, config: MCPServerConfig = {}): Promise<void> {
    const mergedConfig = { ...defaultConfig, ...config }
    try {
        const sheetWrapper = await waitForElement(webviewView, By.id('mynah-sheet-wrapper'))
        let formContainer = await getFormContainer(sheetWrapper)
        let items = await formContainer.findElements(By.css('.mynah-form-input-wrapper'))

        await processFormItem('SCOPE', items[formItemsMap.SCOPE], mergedConfig)
        await processFormItem('NAME', items[formItemsMap.NAME], mergedConfig)
        await processFormItem('TRANSPORT', items[formItemsMap.TRANSPORT], mergedConfig)
        await sleep(2000)

        formContainer = await getFormContainer(sheetWrapper)
        items = await formContainer.findElements(By.css('.mynah-form-input-wrapper'))

        if (mergedConfig.url) {
            await processFormItem('URL', items[formItemsMap.URL], mergedConfig)
        } else {
            if (mergedConfig.command) {
                await processFormItem('COMMAND', items[formItemsMap.COMMAND], mergedConfig)
            }
            if (mergedConfig.args) {
                await processFormItem('ARGS', items[formItemsMap.ARGS], mergedConfig)
            }
        }

        await processFormItem('TIMEOUT', items[items.length - 1], mergedConfig)
    } catch (e) {
        console.log('Error configuring the MCP Server', e)
    }
}

export async function saveMCPServerConfiguration(webviewView: WebviewView): Promise<void> {
    try {
        await clickButton(
            webviewView,
            '[data-testid="chat-item-buttons-wrapper"]',
            '[action-id="save-mcp"] .mynah-button-label',
            'save button'
        )
        await sleep(50000)
    } catch (e) {
        throw new Error(`Failed to save MCP server configuration: ${e}`)
    }
}

export async function cancelMCPServerConfiguration(webviewView: WebviewView): Promise<void> {
    try {
        const sheetWrapper = await waitForElement(webviewView, By.id('mynah-sheet-wrapper'))
        const body = await sheetWrapper.findElement(By.css('.mynah-sheet-body'))
        const filterActions = await body.findElement(By.css('.mynah-detailed-list-filter-actions-wrapper'))
        const saveButton = await filterActions.findElement(
            By.css('.mynah-button.mynah-button-secondary.mynah-button-border.fill-state-always.mynah-ui-clickable-item')
        )
        await saveButton.click()
    } catch (e) {
        console.error('Error saving the MCP server configuration:', e)
    }
}

/**
 * Clicks the refresh button in the MCP server configuration panel
 * @param webviewView The WebviewView instance
 * @returns Promise<boolean> True if refresh button was found and clicked, false otherwise
 */
export async function clickMCPRefreshButton(webviewView: WebviewView): Promise<void> {
    try {
        await clickButton(
            webviewView,
            '.mynah-sheet-header-actions-container',
            'i.mynah-ui-icon-refresh',
            'MCP refresh button'
        )
        await sleep(5000)
    } catch (e) {
        console.error('Error clicking the MCP refresh button:', e)
        throw e
    }
}

/**
 * Clicks the close/cancel button in the MCP server configuration panel
 * @param webviewView The WebviewView instance
 * @returns Promise<boolean> True if close button was found and clicked, false otherwise
 */
export async function clickMCPCloseButton(webviewView: WebviewView): Promise<void> {
    try {
        await clickButton(webviewView, '.mynah-sheet-header', 'i.mynah-ui-icon-cancel', 'MCP close button')
    } catch (e) {
        console.error('Error closing the MCP overlay:', e)
        throw e
    }
}

/**
 * Finds MCP items in the list
 * @param webviewView The WebviewView instance
 * @returns Promise<WebElement[]> Array of MCP list items
 * @throws Error if no MCP items are found in the list
 */
export async function findMCPListItems(webviewView: WebviewView): Promise<WebElement[]> {
    try {
        await sleep(2000)
        const list = await webviewView.findWebElements(By.css('.mynah-detailed-list-item.mynah-ui-clickable-item'))
        if (list.length === 0) {
            throw new Error('No mcp in the list')
        }
        return list
    } catch (e) {
        throw new Error(`Failed to find MCP list items: ${e}`)
    }
}

/**
 * Checks MCP server status by looking for success icon
 * @param webviewView The WebviewView instance
 * @throws Error if status icon not found
 */
export async function checkMCPServerStatus(webviewView: WebviewView): Promise<void> {
    try {
        await waitForElement(webviewView, By.css('.mynah-ui-icon.mynah-ui-icon-ok-circled.status-success'))
    } catch {
        throw new Error('Failed: Status icon not found')
    }
}

/**
 * Validates that all tools have 'ask' permission (except claude-sonnet-4)
 * @param webviewView The WebviewView instance
 * @throws Error if any tool has permission other than 'ask' (excluding claude-sonnet-4)
 */
export async function validateToolPermissions(webviewView: WebviewView): Promise<void> {
    try {
        const selectElements = await webviewView.findWebElements(By.css('select.mynah-form-input'))
        for (const select of selectElements) {
            const selectedOption = await select.findElement(By.css('option:checked'))
            const selectedValue = await selectedOption.getAttribute('value')
            if (selectedValue !== 'claude-sonnet-4' && selectedValue !== 'ask') {
                throw new Error(`Tool has permission '${selectedValue}' instead of 'ask'`)
            }
        }
    } catch (e) {
        throw new Error(`Failed to validate tool permissions: ${e}`)
    }
}

/**
 * Validates MCP dropdown options
 * @param webviewView The WebviewView instance
 * @param expectedValues Array of expected option values
 * @throws Error if any option is not in expectedValues
 */
export async function validateMCPDropdownOptions(webviewView: WebviewView, expectedValues: string[]): Promise<void> {
    try {
        const select = await webviewView.findWebElement(By.css('.mynah-form-input-wrapper select'))
        const options = await select.findElements(
            By.css('option[data-testid="chat-item-form-item-select"]:not(.description-option):not([disabled])')
        )
        for (const option of options) {
            const text = await option.getText()
            if (!expectedValues.includes(text)) {
                throw new Error(`Option "${text}" should be one of: ${expectedValues.join(', ')}`)
            }
        }
    } catch (e) {
        throw new Error(`Failed to validate MCP dropdown options: ${e}`)
    }
}

export async function configureRemoteMCPServer(webviewView: WebviewView, config: MCPServerConfig): Promise<void> {
    await configureMCPServer(webviewView, config)
}
