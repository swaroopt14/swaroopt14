import Image from 'next/image'

type BrandMeta = {
  logo?: string
}

const TENANT_BRANDS: Record<string, BrandMeta> = {
  zomato: {
    logo: '/sources/zomato-clean.png',
  },
  zoamato: {
    logo: '/sources/zomato-clean.png',
  },
  zaomato: {
    logo: '/sources/zomato-clean.png',
  },
  swiggy: {
    logo: '/sources/Swiggy_logo_(old).svg.png',
  },
  flipkart: {
    logo: '/sources/flipkart-logo-png-transparent.png',
  },
  flipkarat: {
    logo: '/sources/flipkart-logo-png-transparent.png',
  },
  amazon: {
    logo: '/sources/Amazon_India_Logo.svg',
  },
  amzon: {
    logo: '/sources/Amazon_India_Logo.svg',
  },
  ajio: {
    logo: '/sources/ajio-clean.png',
  },
}

function normalizeTenantKey(tenant: string) {
  return tenant.toLowerCase().replace(/[_\s-]+/g, '')
}

function tenantInitials(label: string) {
  return label
    .split(/\s+/)
    .map((chunk) => chunk[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

export function TenantIdentity({ tenant }: { tenant: string }) {
  const key = normalizeTenantKey(tenant)
  const brand = TENANT_BRANDS[key]

  return (
    <span className="inline-flex items-center">
      {brand?.logo ? (
        <span className="inline-flex h-12 w-32 items-center justify-center px-1">
          <Image
            src={brand.logo}
            alt={tenant}
            width={112}
            height={32}
            className="h-8 w-28 object-contain"
          />
        </span>
      ) : (
        <span className="inline-flex h-12 w-32 items-center justify-center rounded-lg border border-slate-300 bg-slate-100 px-1 text-sm font-semibold uppercase tracking-wide text-slate-700">
          {tenantInitials(tenant)}
        </span>
      )}
    </span>
  )
}
