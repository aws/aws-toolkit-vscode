/*!
 * Copyright Amazon.com, Inc. or its affiliates. All Rights Reserved.
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Manages the state of edit suggestions to avoid circular dependencies
 */
export class EditSuggestionState {
    private static isEditSuggestionCurrentlyActive = false

    static setEditSuggestionActive(active: boolean): void {
        this.isEditSuggestionCurrentlyActive = active
    }

    static isEditSuggestionActive(): boolean {
        return this.isEditSuggestionCurrentlyActive
    }
}
