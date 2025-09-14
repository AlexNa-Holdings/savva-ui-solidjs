// src/x/fundraising/CampaignContributeModal.jsx
import Modal from "../modals/Modal.jsx";
import ContributeView from "../fundraising/ContributeView.jsx";

export default function CampaignContributeModal(props) {
  const handleClose = () => props.onClose?.();
  const handleSuccess = () => {
    props.onSuccess?.();
    handleClose();
  };

  return (
    <Modal isOpen={props.isOpen} onClose={handleClose} size="xl" noPadding>
      <ContributeView
        campaignId={props.campaignId}
        onSuccess={handleSuccess}
        showCancel={true}
        onCancel={handleClose}
      />
    </Modal>
  );
}
