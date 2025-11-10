# workflow/services/status_resolver.py
from functools import lru_cache
from django.apps import apps

class StatusResolver:
    """
    Map tên trạng thái -> ID cho Document & Case (FK).
    Dùng tên chuẩn:
      VB đến: TIEP_NHAN, DANG_KY, PHAN_CONG, DANG_XU_LY, HOAN_TAT, LUU_TRU, THU_HOI
      VB đi : DU_THAO, TRINH_DUYET, TRA_LAI, PHE_DUYET, KY_SO, PHAT_HANH, HUY_PHAT_HANH, LUU_TRU
      Case   : MOI_TAO, CHO_PHAN_CONG, DA_PHAN_CONG, DANG_THUC_HIEN, TAM_DUNG, CHO_DUYET_DONG, DONG, LUU_TRU
    """

    @staticmethod
    @lru_cache(maxsize=256)
    def doc_status_id(name: str) -> int:
        """
        Trả về catalog.document_statuses.status_id theo status_name.
        """
        Status = apps.get_model('catalog', 'DocumentStatus')
        pk = (
            Status.objects
            .filter(status_name=name)
            .values_list('status_id', flat=True)
            .first()
        )
        if pk is None:
            raise ValueError(f"Không tìm thấy document_statuses.status_name = '{name}'")
        return int(pk)

    @staticmethod
    @lru_cache(maxsize=256)
    def case_status_id(name: str) -> int:
        """
        Trả về catalog.case_statuses.case_status_id theo case_status_name.
        """
        Status = apps.get_model('catalog', 'CaseStatus')
        pk = (
            Status.objects
            .filter(case_status_name=name)
            .values_list('case_status_id', flat=True)
            .first()
        )
        if pk is None:
            raise ValueError(f"Không tìm thấy case_statuses.case_status_name = '{name}'")
        return int(pk)
