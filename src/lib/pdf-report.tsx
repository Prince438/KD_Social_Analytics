import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { TopPost } from "./queries";
import { PLATFORM_META } from "./platforms";

export interface ReportData {
  workspaceName: string;
  rangeDays: number;
  generatedAt: string;
  totals: { followers: number; views: number; engagement: number; posts: number };
  topPosts: TopPost[];
}

const styles = StyleSheet.create({
  page: { padding: 40, fontSize: 10, color: "#171717" },
  title: { fontSize: 20, fontWeight: 700 },
  subtitle: { fontSize: 10, color: "#737373", marginTop: 4, marginBottom: 20 },
  kpiRow: { flexDirection: "row", gap: 12, marginBottom: 24 },
  kpi: {
    flex: 1,
    border: "1pt solid #e5e5e5",
    borderRadius: 6,
    padding: 10,
  },
  kpiLabel: { fontSize: 8, color: "#737373", textTransform: "uppercase" },
  kpiValue: { fontSize: 16, fontWeight: 700, marginTop: 4 },
  sectionTitle: { fontSize: 12, fontWeight: 700, marginBottom: 8 },
  thead: {
    flexDirection: "row",
    borderBottom: "1pt solid #d4d4d4",
    paddingBottom: 4,
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    paddingVertical: 4,
    borderBottom: "0.5pt solid #f0f0f0",
  },
  cPost: { width: "44%", paddingRight: 6 },
  cPlat: { width: "14%" },
  cNum: { width: "14%", textAlign: "right" },
  th: { fontSize: 8, color: "#737373", textTransform: "uppercase" },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 40,
    right: 40,
    fontSize: 8,
    color: "#a3a3a3",
    textAlign: "center",
  },
});

const fmt = (n: number) =>
  new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 }).format(n);

function ReportDocument({ data }: { data: ReportData }) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        <Text style={styles.title}>{data.workspaceName} — Analytics Report</Text>
        <Text style={styles.subtitle}>
          Last {data.rangeDays} days · generated {data.generatedAt}
        </Text>

        <View style={styles.kpiRow}>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Followers</Text>
            <Text style={styles.kpiValue}>{fmt(data.totals.followers)}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Views</Text>
            <Text style={styles.kpiValue}>{fmt(data.totals.views)}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Engagement</Text>
            <Text style={styles.kpiValue}>{fmt(data.totals.engagement)}</Text>
          </View>
          <View style={styles.kpi}>
            <Text style={styles.kpiLabel}>Posts</Text>
            <Text style={styles.kpiValue}>{fmt(data.totals.posts)}</Text>
          </View>
        </View>

        <Text style={styles.sectionTitle}>Top posts</Text>
        <View style={styles.thead}>
          <Text style={[styles.cPost, styles.th]}>Post</Text>
          <Text style={[styles.cPlat, styles.th]}>Platform</Text>
          <Text style={[styles.cNum, styles.th]}>Views</Text>
          <Text style={[styles.cNum, styles.th]}>Likes</Text>
          <Text style={[styles.cNum, styles.th]}>Comments</Text>
        </View>
        {data.topPosts.map((p) => (
          <View key={p.id} style={styles.row} wrap={false}>
            <Text style={styles.cPost}>
              {(p.caption ?? "(untitled)").slice(0, 70)}
            </Text>
            <Text style={styles.cPlat}>{PLATFORM_META[p.platform].label}</Text>
            <Text style={styles.cNum}>{fmt(p.views)}</Text>
            <Text style={styles.cNum}>{fmt(p.likes)}</Text>
            <Text style={styles.cNum}>{fmt(p.comments)}</Text>
          </View>
        ))}

        <Text style={styles.footer} fixed>
          KD Social Analytics
        </Text>
      </Page>
    </Document>
  );
}

/** Renders the report to a PDF buffer. */
export function renderReportPdf(data: ReportData): Promise<Buffer> {
  return renderToBuffer(<ReportDocument data={data} />);
}
