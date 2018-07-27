package software.aws.toolkits.jetbrains.services.lambda;

import com.intellij.json.JsonLanguage;
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

    public LambdaEditorPanel(Project project) {
        this.project = project;

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
    }

    private void createUIComponents() {
        EditorTextFieldProvider textFieldProvider = ServiceManager.getService(project, EditorTextFieldProvider.class);
        input = textFieldProvider.getEditorField(JsonLanguage.INSTANCE, project, Collections.emptyList());
        response = textFieldProvider.getEditorField(JsonLanguage.INSTANCE, project, Collections.singletonList(new IsViewerCustomization()));
        logOutput = textFieldProvider.getEditorField(PlainTextLanguage.INSTANCE, project, Collections.singletonList(new IsViewerCustomization()));
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
