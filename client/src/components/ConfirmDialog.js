import React from 'react';
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogContentText,
  DialogActions,
  Button,
} from '@mui/material';

const ConfirmDialog = ({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  confirmColor = 'error',
  onConfirm,
  onCancel,
}) => (
  <Dialog
    open={Boolean(open)}
    onClose={onCancel}
    aria-labelledby="confirm-dialog-title"
    aria-describedby="confirm-dialog-description"
  >
    <DialogTitle id="confirm-dialog-title" sx={{ fontWeight: 700 }}>
      {title}
    </DialogTitle>
    <DialogContent>
      <DialogContentText id="confirm-dialog-description" sx={{ color: 'text.primary' }}>
        {message}
      </DialogContentText>
    </DialogContent>
    <DialogActions sx={{ px: 3, pb: 2 }}>
      <Button onClick={onCancel} variant="outlined">
        {cancelLabel}
      </Button>
      <Button onClick={onConfirm} color={confirmColor} variant="contained" autoFocus>
        {confirmLabel}
      </Button>
    </DialogActions>
  </Dialog>
);

export default ConfirmDialog;
