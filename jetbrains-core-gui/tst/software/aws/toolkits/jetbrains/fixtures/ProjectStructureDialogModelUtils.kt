// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

package software.aws.toolkits.jetbrains.fixtures

// Copyright 2019 Amazon.com, Inc. or its affiliates. All Rights Reserved.
// SPDX-License-Identifier: Apache-2.0

import com.intellij.testGuiFramework.fixtures.JDialogFixture
import com.intellij.testGuiFramework.impl.jList
import com.intellij.testGuiFramework.impl.testTreeItemExist
import com.intellij.testGuiFramework.util.Predicate
import com.intellij.testGuiFramework.util.scenarios.ProjectStructureDialogModel
import com.intellij.testGuiFramework.util.scenarios.ProjectStructureDialogModel.Constants.itemLibrary
import com.intellij.testGuiFramework.util.scenarios.ProjectStructureDialogModel.Constants.menuProject
import com.intellij.testGuiFramework.util.scenarios.checkLibrary
import com.intellij.testGuiFramework.util.scenarios.connectDialog
import com.intellij.testGuiFramework.util.step

fun ProjectStructureDialogModel.checkPage(page: String, checks: JDialogFixture.() -> Unit) {
    with(guiTestCase) {
        step("at '$page' page in Project Structure dialog") {
            val dialog = connectDialog()
            dialog.jList(page).clickItem(page)
            dialog.checks()
        }
    }
}

fun ProjectStructureDialogModel.checkProject(checks: JDialogFixture.() -> Unit) {
    checkPage(menuProject, checks)
}

fun ProjectStructureDialogModel.checkLibraryPrefixPresent(library: String) {
    checkLibrary {
        guiTestCase.testTreeItemExist(itemLibrary, library, predicate = Predicate.startWith)
    }
}
