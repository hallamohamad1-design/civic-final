import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { MapPin, TrendingUp, Users, CheckCircle2 } from "lucide-react";
import { Link } from "wouter";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { useLanguage } from "@/contexts/LanguageContext";

export default function Home() {
  const { isAuthenticated } = useAuth();
  const { data: issueCount = 0 } = trpc.issues.getCount.useQuery();
  const { t } = useLanguage();

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-50 to-white">
      {/* Hero Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32">
        <div className="grid md:grid-cols-2 gap-12 items-center">
          <div>
            <h1 className="text-5xl md:text-6xl font-bold text-slate-900 leading-tight mb-6">
              {t("home.title")}
              <span className="text-primary"> {t("home.subtitle")}</span>
            </h1>
            <p className="text-xl text-slate-600 mb-8 leading-relaxed">
              {t("home.desc")}
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link href="/map">
                <Button size="lg" className="gap-2 w-full sm:w-auto">
                  <MapPin className="h-5 w-5" />
                  View Map
                </Button>
              </Link>
              {!isAuthenticated ? (
                <Button size="lg" variant="outline" asChild className="w-full sm:w-auto">
                  <a href={getLoginUrl()}>Get Started</a>
                </Button>
              ) : (
                <Link href="/submit">
                  <Button size="lg" variant="outline" className="w-full sm:w-auto">
                    Report an Issue
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {/* Hero Visual */}
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/20 to-primary/5 rounded-2xl blur-3xl" />
            <div className="relative bg-gradient-to-br from-primary/10 to-primary/5 rounded-2xl p-8 border border-primary/20">
              <div className="space-y-4">
                <div className="flex items-center gap-3 p-4 bg-white rounded-lg shadow-sm">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-sm font-semibold text-slate-700">Open Issues</span>
                </div>
                <div className="flex items-center gap-3 p-4 bg-white rounded-lg shadow-sm">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span className="text-sm font-semibold text-slate-700">In Progress</span>
                </div>
                <div className="flex items-center gap-3 p-4 bg-white rounded-lg shadow-sm">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="text-sm font-semibold text-slate-700">Resolved</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Stats */}
        <div className="grid md:grid-cols-3 gap-6 mt-20">
          <Card className="border-none bg-slate-50 hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 font-medium">Issues Reported</p>
                  <p className="text-3xl font-bold text-slate-900 mt-2">{typeof issueCount === 'number' ? issueCount : 0}</p>
                </div>
                <div className="bg-primary/10 p-3 rounded-lg">
                  <TrendingUp className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none bg-slate-50 hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 font-medium">Active Contributors</p>
                  <p className="text-3xl font-bold text-slate-900 mt-2">1.2K+</p>
                </div>
                <div className="bg-primary/10 p-3 rounded-lg">
                  <Users className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none bg-slate-50 hover:shadow-lg transition-shadow">
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-slate-600 font-medium">Issues Resolved</p>
                  <p className="text-3xl font-bold text-slate-900 mt-2">87%</p>
                </div>
                <div className="bg-primary/10 p-3 rounded-lg">
                  <CheckCircle2 className="h-6 w-6 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <h2 className="text-4xl font-bold text-slate-900 text-center mb-12">
          Why Choose CivicPulse?
        </h2>

        <div className="grid md:grid-cols-3 gap-8">
          <Card className="border-none bg-white hover:shadow-lg transition-shadow">
            <CardContent className="p-8">
              <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                <MapPin className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Interactive Map</h3>
              <p className="text-slate-600 leading-relaxed">
                Visualize all reported issues on an interactive map with color-coded status indicators for easy tracking.
              </p>
            </CardContent>
          </Card>

          <Card className="border-none bg-white hover:shadow-lg transition-shadow">
            <CardContent className="p-8">
              <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                <TrendingUp className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Real-time Updates</h3>
              <p className="text-slate-600 leading-relaxed">
                Track the status of reported issues in real-time as authorities work on resolutions.
              </p>
            </CardContent>
          </Card>

          <Card className="border-none bg-white hover:shadow-lg transition-shadow">
            <CardContent className="p-8">
              <div className="bg-primary/10 w-12 h-12 rounded-lg flex items-center justify-center mb-4">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-xl font-bold text-slate-900 mb-3">Community Driven</h3>
              <p className="text-slate-600 leading-relaxed">
                Upvote issues to show support and help prioritize the most urgent civic problems.
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20">
        <div className="bg-gradient-to-r from-primary/10 to-primary/5 rounded-2xl p-12 text-center border border-primary/20">
          <h2 className="text-3xl md:text-4xl font-bold text-slate-900 mb-6">
            Ready to Make a Difference?
          </h2>
          <p className="text-lg text-slate-600 mb-8 max-w-2xl mx-auto">
            Start reporting civic issues today and help your community thrive.
          </p>
          {!isAuthenticated ? (
            <Button size="lg" asChild>
              <a href={getLoginUrl()}>Get Started Now</a>
            </Button>
          ) : (
            <Link href="/submit">
              <Button size="lg">Report Your First Issue</Button>
            </Link>
          )}
        </div>
      </section>
    </div>
  );
}
