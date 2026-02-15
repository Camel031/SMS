import django_filters

from .models import RentalAgreement


class RentalAgreementFilter(django_filters.FilterSet):
    direction = django_filters.ChoiceFilter(choices=RentalAgreement.Direction.choices)
    status = django_filters.ChoiceFilter(choices=RentalAgreement.Status.choices)

    class Meta:
        model = RentalAgreement
        fields = ["direction", "status"]
