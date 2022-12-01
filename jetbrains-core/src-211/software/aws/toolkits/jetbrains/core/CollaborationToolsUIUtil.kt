@file:Suppress("AbsentOrWrongFileLicense")
// Source copied from https://github.com/JetBrains/intellij-community/blob/75331e456bc70be894c5748209a2a2c7e4f51bd4/platform/collaboration-tools/src/com/intellij/collaboration/ui/CollaborationToolsUIUtil.kt
// FIX_WHEN_MIN_IS_212: delete since it was introduced in 212
package software.aws.toolkits.jetbrains.core

import com.intellij.ui.DocumentAdapter
import com.intellij.ui.ScrollingUtil
import com.intellij.ui.SearchTextField
import com.intellij.ui.speedSearch.NameFilteringListModel
import com.intellij.ui.speedSearch.SpeedSearch
import javax.swing.JList
import javax.swing.event.DocumentEvent

object CollaborationToolsUIUtil {
    fun <T> attachSearch(list: JList<T>, searchTextField: SearchTextField, searchBy: (T) -> String) {
        val speedSearch = SpeedSearch(false)
        val filteringListModel = NameFilteringListModel<T>(list.model, searchBy, speedSearch::shouldBeShowing, speedSearch.filter::orEmpty)
        list.model = filteringListModel

        searchTextField.addDocumentListener(object : DocumentAdapter() {
            override fun textChanged(e: DocumentEvent) = speedSearch.updatePattern(searchTextField.text)
        })

        speedSearch.addChangeListener {
            val prevSelection = list.selectedValue // save to restore the selection on filter drop
            filteringListModel.refilter()
            if (filteringListModel.size > 0) {
                val fullMatchIndex = if (speedSearch.isHoldingFilter) filteringListModel.closestMatchIndex
                else filteringListModel.getElementIndex(prevSelection)
                if (fullMatchIndex != -1) {
                    list.selectedIndex = fullMatchIndex
                }

                if (filteringListModel.size <= list.selectedIndex || !filteringListModel.contains(list.selectedValue)) {
                    list.selectedIndex = 0
                }
            }
        }

        ScrollingUtil.installActions(list)
        ScrollingUtil.installActions(list, searchTextField.textEditor)
    }
}
