package com.amazonaws.intellij.actions

import com.amazonaws.intellij.ui.modals.UploadToLambdaModal
import com.intellij.lang.Language
import com.intellij.openapi.actionSystem.AnAction
import com.intellij.openapi.actionSystem.AnActionEvent
import com.intellij.openapi.actionSystem.LangDataKeys

class UploadLambdaFunction : AnAction() {
    override fun actionPerformed(event: AnActionEvent?) {
        if (event == null) return
        val project = event.project ?: return
        val psi = event.getData(LangDataKeys.PSI_FILE)
        if (psi == null) {
            handleError("Couldn't determine language")
            return
        }
        if (!psi.language.`is`(Language.findLanguageByID("JAVA"))) {
            handleError("Invalid language, only Java supported at present, language detected as '${psi.language}'")
            return
        }

        val uploadModal = UploadToLambdaModal(project, psi)
        uploadModal.show()

    }

    private fun handleError(msg: String) {
        System.out.println(msg)
    }
}