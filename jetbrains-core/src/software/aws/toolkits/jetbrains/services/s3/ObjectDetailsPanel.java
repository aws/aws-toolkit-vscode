package software.aws.toolkits.jetbrains.services.s3;

import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.ide.CopyPasteManager;
import com.intellij.openapi.util.text.StringUtil;
import com.intellij.ui.IdeBorderFactory;
import com.intellij.ui.components.JBLabel;
import com.intellij.ui.components.JBTabbedPane;
import com.intellij.util.ui.JBUI;
import com.intellij.util.ui.TextTransferable;
import java.awt.Insets;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import javax.swing.JButton;
import javax.swing.JComponent;
import javax.swing.JPanel;
import javax.swing.JTabbedPane;
import javax.swing.SwingConstants;
import org.jetbrains.annotations.NotNull;
import software.amazon.awssdk.services.s3.model.Tag;
import software.aws.toolkits.jetbrains.utils.DateUtils;
import software.aws.toolkits.jetbrains.utils.MessageUtils;
import software.aws.toolkits.jetbrains.utils.keyvalue.KeyValue;
import software.aws.toolkits.jetbrains.utils.keyvalue.KeyValueTableEditor;

public class ObjectDetailsPanel {
    private final S3VirtualFile s3File;
    private JPanel contentPanel;
    private JBLabel objectNameLabel;
    private JBLabel size;
    private JBLabel modifiedDate;
    private JButton copyArnButton;
    private JButton applyButton;
    private JButton cancelButton;
    private JTabbedPane tabbedPanel;
    private KeyValueTableEditor tags;
    private KeyValueTableEditor metadata;
    private JBLabel eTag;

    public ObjectDetailsPanel(S3VirtualFile s3File) {
        this.s3File = s3File;

        this.contentPanel.setBorder(IdeBorderFactory.createTitledBorder("Object Details", false));

        this.objectNameLabel.setText(s3File.getName());

        this.size.setText(StringUtil.formatFileSize(s3File.getLength()));
        this.modifiedDate.setText(DateUtils.formatDate(s3File.getTimeStamp()));
        this.eTag.setText(s3File.getFile().getEtag());

        this.copyArnButton.addActionListener(e -> {
            String arn = "arn:aws:s3:::" + s3File.getPath();
            CopyPasteManager.getInstance().setContents(new TextTransferable(arn));
        });

        this.applyButton.addActionListener(actionEvent -> applyChanges());
        this.cancelButton.addActionListener(actionEvent -> cancelChanges());

        this.tags.refresh();
        this.metadata.refresh();
    }

    private void createUIComponents() {
        tags = new KeyValueTableEditor(this::loadTags, null, null, this::onValueChanged);
        metadata = new KeyValueTableEditor(this::loadMetadata, null, null, this::onValueChanged);

        tabbedPanel = new JBTabbedPane(SwingConstants.TOP) {
            @NotNull
            @Override
            protected Insets getInsetsForTabComponent() {
                return JBUI.emptyInsets();
            }
        };
    }

    private List<KeyValue> loadTags() {
        return s3File.getFile().tags()
                     .stream()
                     .map(entry -> new KeyValue(entry.key(), entry.value()))
                     .collect(Collectors.toList());
    }

    private List<KeyValue> loadMetadata() {
        return s3File.getFile().metadata()
                     .entrySet()
                     .stream()
                     .map(entry -> new KeyValue(entry.getKey(), entry.getValue()))
                     .collect(Collectors.toList());
    }

    private void onValueChanged() {
        if (tags.isModified() || metadata.isModified()) {
            applyButton.setEnabled(true);
            cancelButton.setEnabled(true);
        } else {
            applyButton.setEnabled(false);
            cancelButton.setEnabled(false);
        }
    }

    private void applyChanges() {
        metadata.setBusy(true);
        tags.setBusy(true);
        applyButton.setEnabled(false);
        cancelButton.setEnabled(false);

        // To update metadata, we need to issue a copy
        if (metadata.isModified() && tags.isModified()) {
            Set<Tag> newTags = tags.getItems().stream()
                                   .map(keyValue -> Tag.builder().key(keyValue.getKey()).value(keyValue.getValue()).build())
                                   .collect(Collectors.toSet());

            ApplicationManager.getApplication()
                              .executeOnPooledThread(() -> {
                                  s3File.getFile().updateMetadataAndTags(metadata.getItems().stream().collect(Collectors.toMap(KeyValue::getKey, KeyValue::getValue)), newTags);
                                  metadata.refresh();
                                  tags.refresh();
                              });

        } else if (metadata.isModified()) {
            ApplicationManager.getApplication()
                              .executeOnPooledThread(() -> {
                                  s3File.getFile().updateMetadata(metadata.getItems().stream().collect(Collectors.toMap(KeyValue::getKey, KeyValue::getValue)));
                                  metadata.refresh();
                              });

        } else {

            Set<Tag> newTags = tags.getItems().stream()
                                   .map(keyValue -> Tag.builder().key(keyValue.getKey()).value(keyValue.getValue()).build())
                                   .collect(Collectors.toSet());

            ApplicationManager.getApplication()
                              .executeOnPooledThread(() -> {
                                  s3File.getFile().updateTags(newTags);
                                  tags.refresh();
                              });
        }
    }

    private void cancelChanges() {
        if (!MessageUtils.verifyLossOfChanges(contentPanel)) {
            return;
        }

        if (tags.isModified()) {
            tags.reset();
        }

        if (metadata.isModified()) {
            metadata.reset();
        }
    }

    public JComponent getComponent() {
        return contentPanel;
    }
}
