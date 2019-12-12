package software.aws.toolkits.jetbrains.services.s3.editor;

import com.intellij.openapi.Disposable;
import com.intellij.openapi.actionSystem.ActionManager;
import com.intellij.openapi.actionSystem.ActionPlaces;
import com.intellij.openapi.actionSystem.DefaultActionGroup;
import com.intellij.openapi.actionSystem.Separator;
import com.intellij.openapi.application.ApplicationManager;
import com.intellij.openapi.application.ModalityState;
import com.intellij.openapi.project.Project;
import com.intellij.openapi.util.Disposer;
import com.intellij.ui.PopupHandler;
import com.intellij.ui.components.JBScrollPane;
import com.intellij.ui.treeStructure.SimpleTreeStructure;
import com.intellij.util.ui.ColumnInfo;

import java.awt.BorderLayout;
import java.awt.Dimension;
import java.awt.event.ActionEvent;
import java.awt.event.MouseAdapter;
import java.awt.event.MouseEvent;
import javax.swing.AbstractAction;
import javax.swing.Action;
import javax.swing.JComponent;
import javax.swing.JLabel;
import javax.swing.JPanel;
import javax.swing.JPopupMenu;
import javax.swing.JTextField;
import javax.swing.KeyStroke;
import javax.swing.SwingConstants;
import javax.swing.table.DefaultTableCellRenderer;

import software.amazon.awssdk.services.s3.S3Client;
import software.aws.toolkits.jetbrains.services.s3.resources.S3Resources;
import software.aws.toolkits.jetbrains.services.s3.S3TreeCellRenderer;
import software.aws.toolkits.jetbrains.services.s3.objectActions.CopyPathAction;
import software.aws.toolkits.jetbrains.services.s3.objectActions.DeleteObjectAction;
import software.aws.toolkits.jetbrains.services.s3.objectActions.DownloadObjectAction;
import software.aws.toolkits.jetbrains.services.s3.objectActions.RenameObjectAction;
import software.aws.toolkits.jetbrains.services.s3.objectActions.UploadObjectAction;
import software.aws.toolkits.jetbrains.ui.tree.AsyncTreeModel;
import software.aws.toolkits.jetbrains.ui.tree.StructureTreeModel;

@SuppressWarnings("unchecked")
public class S3ViewerPanel {
    public S3VirtualBucket bucketVirtual;
    private final int SCROLLPANE_SIZE = 11;
    private JPanel content;
    private JTextField name;
    private JLabel creationDate;
    private JTextField date;
    private JPanel mainPanel;
    private JTextField arnText;
    private JLabel bucketArn;
    private JLabel bucketName;
    private S3TreeTable treeTable;
    private S3TreeNode s3TreeNode;
    private S3TreeTableModel model;

    public S3ViewerPanel(Project project, S3Client s3client, S3VirtualBucket bucketVirtual) {
        this.bucketVirtual = bucketVirtual;
        this.name.setText(bucketVirtual.getName());
        this.date.setText(S3Resources.formatDate(bucketVirtual.getS3Bucket().creationDate()));

        this.arnText.setText("arn:aws:s3:::" + bucketVirtual.getName());
        this.bucketArn.setText("Bucket ARN:");
        this.bucketName.setText("Bucket Name:");
        this.creationDate.setText("Creation Date:");
        this.date.setEditable(false);
        this.arnText.setEditable(false);
        this.name.setEditable(false);
        JPopupMenu menu = new JPopupMenu();
        Action copyAction = new AbstractAction("Copy") {
            @Override
            public void actionPerformed(ActionEvent ae) {
                arnText.selectAll();
                arnText.copy();
            }
        };
        copyAction.putValue(Action.ACCELERATOR_KEY, KeyStroke.getKeyStroke("command C"));
        menu.add(copyAction);
        arnText.setComponentPopupMenu(menu);

        ApplicationManager.getApplication().executeOnPooledThread(() -> {
            s3TreeNode = new S3TreeDirectoryNode(s3client, bucketVirtual.getName(), null, "");

            ColumnInfo key = new S3Column(S3ColumnType.NAME);
            ColumnInfo size = new S3Column(S3ColumnType.SIZE);
            ColumnInfo modified = new S3Column(S3ColumnType.LAST_MODIFIED);
            final ColumnInfo[] COLUMNS = new ColumnInfo[] {key, size, modified};
            model = createTreeTableModel(COLUMNS);

            S3TreeCellRenderer treeRenderer = new S3TreeCellRenderer();
            DefaultTableCellRenderer tableRenderer = new DefaultTableCellRenderer();
            tableRenderer.setHorizontalAlignment(SwingConstants.LEFT);
            /**
             *  Navigation buttons for pages
             */

            ApplicationManager.getApplication().invokeLater(() -> {
                treeTable = new S3TreeTable(model, bucketVirtual, project, s3client);
                treeTable.setRootVisible(false);
                treeTable.setDefaultRenderer(Object.class, tableRenderer);
                treeTable.setTreeCellRenderer(treeRenderer);
                treeTable.setCellSelectionEnabled(false);
                JBScrollPane scrollPane = new JBScrollPane(treeTable, JBScrollPane.VERTICAL_SCROLLBAR_AS_NEEDED,
                                                           JBScrollPane.HORIZONTAL_SCROLLBAR_AS_NEEDED);

                treeTable.setRowSelectionAllowed(true);
                int width = treeTable.getPreferredSize().width;
                scrollPane.setPreferredSize(new Dimension(width, treeTable.getRowHeight() * SCROLLPANE_SIZE));

                treeTable.setAutoCreateRowSorter(true);
                treeTable.setRowSorter(new S3RowSorter(treeTable.getModel()));
                addTreeActions();

                treeTable.getColumnModel().getColumn(1).setMaxWidth(120);

                mainPanel.add(scrollPane, BorderLayout.CENTER);

                clearSelectionOnWhiteSpace();
            }, ModalityState.defaultModalityState());
        });
    }

    private void createUIComponents() {
    }

    public JComponent getComponent() {
        return content;
    }

    public JTextField getName() {
        return name;
    }

    private S3TreeTableModel createTreeTableModel(ColumnInfo[] columns) {
        Disposable myTreeModelDisposable = Disposer.newDisposable();
        SimpleTreeStructure treeStructure = new SimpleTreeStructure.Impl(s3TreeNode);
        StructureTreeModel<SimpleTreeStructure> myTreeModel = new StructureTreeModel(treeStructure, myTreeModelDisposable);
        return new S3TreeTableModel(new AsyncTreeModel(myTreeModel, true, myTreeModelDisposable), columns, myTreeModel);
    }

    private void addTreeActions() {
        DefaultActionGroup actionGroup = new DefaultActionGroup();
        actionGroup.add(new DownloadObjectAction(treeTable, bucketVirtual));
        actionGroup.add(new UploadObjectAction(bucketVirtual, treeTable));
        actionGroup.add(new Separator());
        actionGroup.add(new RenameObjectAction(treeTable, bucketVirtual));
        actionGroup.add(new CopyPathAction(treeTable, bucketVirtual));
        actionGroup.add(new Separator());
        actionGroup.add(new DeleteObjectAction(treeTable, bucketVirtual));
        PopupHandler.installPopupHandler(treeTable, actionGroup, ActionPlaces.EDITOR_POPUP, ActionManager.getInstance());
    }

    private void clearSelectionOnWhiteSpace() {
        mainPanel.addMouseListener(new MouseAdapter() {
            @Override
            public void mouseClicked(MouseEvent e) {
                if (!treeTable.contains(e.getPoint())) {
                    treeTable.clearSelection();
                }
            }
        });
    }
}
