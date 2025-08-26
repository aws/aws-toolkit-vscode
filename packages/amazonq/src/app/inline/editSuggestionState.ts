/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Manages the state of edit suggestions to avoid circular dependencies
 */
export class EditSuggestionState {
    private static isEditSuggestionCurrentlyActive = false
    private static displayStartTime = performance.now()

    static setEditSuggestionActive(active: boolean): void {
        this.isEditSuggestionCurrentlyActive = active
        this.displayStartTime = performance.now()
    }

    static isEditSuggestionActive(): boolean {
        return this.isEditSuggestionCurrentlyActive
    }

    static isEditSuggestionDisplayingOverOneSecond(): boolean {
        return this.isEditSuggestionActive() && performance.now() - this.displayStartTime > 1000
    }
}
