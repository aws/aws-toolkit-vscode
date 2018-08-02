package software.aws.toolkits.jetbrains.services.lambda;

import com.intellij.icons.AllIcons;
import com.intellij.ide.DataManager;
import com.intellij.ide.actions.EditSourceAction;
import com.intellij.idea.ActionsBundle;
import com.intellij.json.JsonLanguage;
import com.intellij.openapi.actionSystem.ActionManager;
import com.intellij.openapi.actionSystem.ActionToolbar;
import com.intellij.openapi.actionSystem.DataProvider;
import com.intellij.openapi.actionSystem.DefaultActionGroup;
import com.intellij.openapi.components.ServiceManager;
import com.intellij.openapi.editor.ex.EditorEx;
import com.intellij.openapi.fileTypes.PlainTextLanguage;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.ui.Splitter;
import com.intellij.ui.EditorCustomization;
import com.intellij.ui.EditorTextField;
import com.intellij.ui.EditorTextFieldProvider;
import com.intellij.ui.IdeBorderFactory;
import com.intellij.ui.JBSplitter;
import com.intellij.util.ui.JBUI;
import com.intellij.util.ui.JBUI.Fonts;
import java.awt.BorderLayout;
import java.awt.Insets;
import java.util.Collections;
import javax.swing.JButton;
import javax.swing.JComboBox;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JTextField;
import org.jetbrains.annotations.NotNull;
import software.aws.toolkits.resources.Localization;

public final class LambdaEditorPanel {
    private final Project project;
    JTextField handler;
    JLabel title;
    JLabel description;
    JLabel lastModified;

    EditorTextField input;

    JPanel contentPanel;
    JTextField arn;
    JButton invoke;
    EditorTextField response;
    EditorTextField logOutput;
    JComboBox exampleRequests;
    private JPanel logOutputPanel;
    private JPanel invokePanel;
    private JPanel inputPanel;
    private JPanel responsePanel;
    private JPanel handlerPanel;

    public LambdaEditorPanel(@NotNull Project project,
                             @NotNull DataProvider controller) {
        this.project = project;

        // Set the data provider
        DataManager.registerDataProvider(contentPanel, controller);

        // Patch up the UI with things we can't do in the designer easily
        description.setFont(Fonts.smallFont());

        Insets insets = JBUI.emptyInsets();
        inputPanel.setBorder(IdeBorderFactory.createTitledBorder(Localization.message("lambda.input"), false, insets));
        responsePanel.setBorder(IdeBorderFactory.createTitledBorder(Localization.message("lambda.response"), false, insets));
        logOutputPanel.setBorder(IdeBorderFactory.createTitledBorder(Localization.message("lambda.log_output"), false, insets));

        input.setBorder(IdeBorderFactory.createBorder());
        response.setBorder(IdeBorderFactory.createBorder());
        logOutput.setBorder(IdeBorderFactory.createBorder());

        Splitter horizontalSplitter = new JBSplitter();
        horizontalSplitter.setFirstComponent(inputPanel);
        horizontalSplitter.setSecondComponent(responsePanel);

        Splitter verticalSplitter = new JBSplitter(true, 0.75f);
        verticalSplitter.setFirstComponent(horizontalSplitter);
        verticalSplitter.setSecondComponent(logOutputPanel);

        invokePanel.add(verticalSplitter, BorderLayout.CENTER);

        // Add the jump to source action to the right of the handler box
        // Using a toolbar since it handles updating action presentation...

        EditSourceAction editSourceAction = new EditSourceAction();
        editSourceAction.getTemplatePresentation().setIcon(AllIcons.Actions.EditSource);
        editSourceAction.getTemplatePresentation().setText(ActionsBundle.actionText("EditSource"));
        editSourceAction.getTemplatePresentation().setDescription(ActionsBundle.actionText("EditSource"));

        DefaultActionGroup actionGroup = new DefaultActionGroup();
        actionGroup.add(editSourceAction);
        ActionToolbar toolbar = ActionManager.getInstance().createActionToolbar("LambdaEditor", actionGroup, true);
        toolbar.setReservePlaceAutoPopupIcon(false);
        toolbar.setMinimumButtonSize(JBUI.emptySize());
        toolbar.setTargetComponent(contentPanel);

        handlerPanel.add(toolbar.getComponent(), BorderLayout.EAST);
    }

    private void createUIComponents() {
        EditorTextFieldProvider textFieldProvider = ServiceManager.getService(project, EditorTextFieldProvider.class);
        input = textFieldProvider.getEditorField(JsonLanguage.INSTANCE, project, Collections.emptyList());
        response = textFieldProvider.getEditorField(JsonLanguage.INSTANCE, project,
                                                    Collections.singletonList(new IsViewerCustomization()));
        logOutput = textFieldProvider.getEditorField(PlainTextLanguage.INSTANCE, project,
                                                     Collections.singletonList(new IsViewerCustomization()));
    }

    public void setBusy(Boolean busy) {
        input.setEnabled(!busy);
    }

    private class IsViewerCustomization implements EditorCustomization {
        @Override
        public void customize(@NotNull EditorEx editor) {
            editor.setViewer(true);
        }
    }
}
