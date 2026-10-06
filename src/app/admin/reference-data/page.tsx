import { prisma } from "@/lib/prisma";
import CrudTable from "@/components/admin/CrudTable";

function Section({ id, title, children, note }: { id: string; title: string; note: string; children: React.ReactNode }) {
  return (
    <section id={id} aria-labelledby={`${id}-h`} className="mt-10 first:mt-6">
      <h2 id={`${id}-h`} className="text-lg font-semibold text-zinc-900">{title}</h2>
      <p className="mb-3 mt-1 text-sm text-zinc-600">{note}</p>
      {children}
    </section>
  );
}

export default async function ReferenceDataPage() {
  const [roles, regions, languages, cities, regionLanguages, bands] = await Promise.all([
    prisma.jobRole.findMany({ orderBy: { name: "asc" } }),
    prisma.region.findMany({ orderBy: { name: "asc" } }),
    prisma.language.findMany({ orderBy: { name: "asc" } }),
    prisma.city.findMany({ orderBy: [{ region: { name: "asc" } }, { name: "asc" }] }),
    prisma.regionLanguage.findMany({ include: { region: true, language: true }, orderBy: { region: { name: "asc" } } }),
    prisma.experienceBand.findMany({ orderBy: { sortOrder: "asc" } }),
  ]);

  const regionOptions = regions.map((r) => ({ value: r.id, label: r.name }));
  const languageOptions = languages.map((l) => ({ value: l.id, label: l.name }));

  return (
    <div>
      <h1 className="text-2xl font-semibold text-zinc-900">Roles, regions &amp; languages</h1>
      <p className="mt-1 text-zinc-600">
        The lists that candidates, recruiters and tests rely on. Anything in use can be deactivated
        instead of deleted.
      </p>
      <nav aria-label="Sections" className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-brand-700">
        {[["job-roles", "Job roles"], ["regions", "Regions"], ["cities", "Cities"], ["languages", "Languages"], ["region-languages", "Region languages"], ["bands", "Experience bands"]].map(([id, label]) => (
          <a key={id} href={`#${id}`} className="underline">{label}</a>
        ))}
      </nav>

      <Section id="job-roles" title="Job roles" note="Candidates pick one at signup, and job skill questions are written for it.">
        <CrudTable
          entity="job-roles"
          addLabel="Add role"
          blank={{ name: "", description: "", isActive: true }}
          columns={[
            { key: "name", label: "Name", type: "text", width: "10rem" },
            { key: "description", label: "Description", type: "text", width: "14rem" },
            { key: "isActive", label: "Active", type: "checkbox" },
          ]}
          rows={roles.map((r) => ({ id: r.id, name: r.name, description: r.description ?? "", isActive: r.isActive }))}
        />
      </Section>

      <Section id="regions" title="Regions" note="Provinces or territories. Each candidate belongs to one, and it decides their language test.">
        <CrudTable
          entity="regions"
          addLabel="Add region"
          blank={{ name: "", isActive: true }}
          columns={[
            { key: "name", label: "Name", type: "text", width: "14rem" },
            { key: "isActive", label: "Active", type: "checkbox" },
          ]}
          rows={regions.map((r) => ({ id: r.id, name: r.name, isActive: r.isActive }))}
        />
      </Section>

      <Section id="cities" title="Cities" note="The city list on the signup forms, grouped by region.">
        <CrudTable
          entity="cities"
          addLabel="Add city"
          blank={{ name: "", regionId: "", isActive: true }}
          columns={[
            { key: "name", label: "City", type: "text", width: "10rem" },
            { key: "regionId", label: "Region", type: "select", options: regionOptions, width: "12rem" },
            { key: "isActive", label: "Active", type: "checkbox" },
          ]}
          rows={cities.map((c) => ({ id: c.id, name: c.name, regionId: c.regionId, isActive: c.isActive }))}
        />
      </Section>

      <Section id="languages" title="Languages" note="Languages questions can be written in. The default language is used for English-only content such as the personality items.">
        <CrudTable
          entity="languages"
          addLabel="Add language"
          blank={{ name: "", code: "", isActive: true, isDefault: false, isRtl: false }}
          columns={[
            { key: "name", label: "Name", type: "text", width: "10rem" },
            { key: "code", label: "Code", type: "text", width: "6rem" },
            { key: "isActive", label: "Active", type: "checkbox" },
            { key: "isDefault", label: "Default", type: "checkbox" },
            { key: "isRtl", label: "Right-to-left", type: "checkbox" },
          ]}
          rows={languages.map((l) => ({ id: l.id, name: l.name, code: l.code, isActive: l.isActive, isDefault: l.isDefault, isRtl: l.isRtl }))}
        />
      </Section>

      <Section id="region-languages" title="Region language map" note="Which language test each region gets. Mark one language as primary per region.">
        <CrudTable
          entity="region-languages"
          addLabel="Add mapping"
          blank={{ regionId: "", languageId: "", isPrimary: false }}
          columns={[
            { key: "regionId", label: "Region", type: "select", options: regionOptions, width: "12rem" },
            { key: "languageId", label: "Language", type: "select", options: languageOptions, width: "10rem" },
            { key: "isPrimary", label: "Primary", type: "checkbox" },
          ]}
          rows={regionLanguages.map((m) => ({ id: m.id, regionId: m.regionId, languageId: m.languageId, isPrimary: m.isPrimary }))}
        />
      </Section>

      <Section id="bands" title="Experience bands" note="Groups of years of experience used by the salary benchmarks. Leave maximum empty for open-ended (10+).">
        <CrudTable
          entity="experience-bands"
          addLabel="Add band"
          blank={{ label: "", minYears: 0, maxYears: null, sortOrder: bands.length + 1 }}
          columns={[
            { key: "label", label: "Label", type: "text", width: "9rem" },
            { key: "minYears", label: "Min years", type: "number" },
            { key: "maxYears", label: "Max years", type: "number", nullable: true },
            { key: "sortOrder", label: "Order", type: "number" },
          ]}
          rows={bands.map((b) => ({ id: b.id, label: b.label, minYears: b.minYears, maxYears: b.maxYears, sortOrder: b.sortOrder }))}
        />
      </Section>
    </div>
  );
}
