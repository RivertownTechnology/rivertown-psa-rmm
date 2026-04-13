import { BookOpen, Calendar, Clock, ArrowRight } from 'lucide-react';
import { useDocumentTitle } from '@/lib/useDocumentTitle';
import { posts, type BlogPost } from '@/content/blog';

export function Blog({ navigate, slug }: { navigate: (p: string) => void; slug?: string }) {
  if (slug) {
    const post = posts.find((p) => p.slug === slug);
    if (post) return <PostPage post={post} navigate={navigate} />;
  }
  return <BlogIndex navigate={navigate} />;
}

function BlogIndex({ navigate }: { navigate: (p: string) => void }) {
  useDocumentTitle(
    'Blog — ForgePSA',
    'Plain-spoken writing on PSA software, MSP operations, billing, automation, and tool selection — from the team building ForgePSA.',
  );

  const pillars = posts.filter((p) => p.pillar);
  const articles = posts.filter((p) => !p.pillar);

  return (
    <>
      <section className="bg-gradient-to-br from-brand-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-950 dark:to-slate-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-20 pb-12 text-center">
          <div className="inline-flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1 text-xs font-medium text-slate-700 dark:text-slate-300 mb-6 shadow-sm">
            <BookOpen className="h-3.5 w-3.5 text-brand-600 dark:text-brand-400" />
            Writing for operators
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
            The ForgePSA blog.
          </h1>
          <p className="text-xl text-slate-600 dark:text-slate-300">
            Long-form guides and sharp takes on PSA software, MSP billing, automation, and the tools we actually use.
          </p>
        </div>
      </section>

      {pillars.length > 0 && (
        <section className="py-16 bg-white dark:bg-slate-950">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <h2 className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-4">Pillar guides</h2>
            <div className="grid gap-4 md:grid-cols-2">
              {pillars.map((p) => <PostCard key={p.slug} post={p} navigate={navigate} featured />)}
            </div>
          </div>
        </section>
      )}

      <section className="py-16 bg-slate-50 dark:bg-slate-900">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-xs font-bold uppercase tracking-wider text-brand-600 dark:text-brand-400 mb-4">Articles</h2>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {articles.map((p) => <PostCard key={p.slug} post={p} navigate={navigate} />)}
          </div>
          {articles.length === 0 && (
            <p className="text-slate-600 dark:text-slate-300 text-center py-12">More articles soon.</p>
          )}
        </div>
      </section>
    </>
  );
}

function PostCard({ post, navigate, featured }: { post: BlogPost; navigate: (p: string) => void; featured?: boolean }) {
  return (
    <button
      onClick={() => navigate(`/blog/${post.slug}`)}
      className={`text-left p-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:shadow-lg hover:border-brand-300 dark:hover:border-brand-700 transition-all group ${
        featured ? 'md:p-8' : ''
      }`}
    >
      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mb-3">
        <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{post.date}</span>
        <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{post.readMinutes} min read</span>
        {post.category && <span className="px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 font-semibold">{post.category}</span>}
      </div>
      <h3 className={`font-bold text-slate-900 dark:text-white mb-2 ${featured ? 'text-xl md:text-2xl' : 'text-lg'}`}>
        {post.title}
      </h3>
      <p className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed mb-3">{post.excerpt}</p>
      <div className="inline-flex items-center gap-1 text-brand-600 dark:text-brand-400 font-semibold text-sm group-hover:gap-2 transition-all">
        Read <ArrowRight className="h-3.5 w-3.5" />
      </div>
    </button>
  );
}

function PostPage({ post, navigate }: { post: BlogPost; navigate: (p: string) => void }) {
  useDocumentTitle(
    `${post.title} — ForgePSA Blog`,
    post.excerpt,
  );

  return (
    <>
      <article className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 py-16">
        <button
          onClick={() => navigate('/blog')}
          className="text-sm text-brand-600 dark:text-brand-400 hover:underline mb-6 inline-flex items-center gap-1"
        >
          ← All posts
        </button>
        <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400 mb-4">
          <span className="inline-flex items-center gap-1"><Calendar className="h-3 w-3" />{post.date}</span>
          <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{post.readMinutes} min read</span>
          {post.category && <span className="px-2 py-0.5 rounded-full bg-brand-50 dark:bg-brand-950/40 text-brand-700 dark:text-brand-300 font-semibold">{post.category}</span>}
        </div>
        <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-slate-900 dark:text-white mb-4">
          {post.title}
        </h1>
        <p className="text-xl text-slate-600 dark:text-slate-300 mb-10 leading-relaxed">
          {post.excerpt}
        </p>
        <div className="post-body text-slate-700 dark:text-slate-200 leading-relaxed
          [&_h2]:text-2xl [&_h2]:md:text-3xl [&_h2]:font-bold [&_h2]:text-slate-900 dark:[&_h2]:text-white [&_h2]:mt-12 [&_h2]:mb-4
          [&_h3]:text-xl [&_h3]:font-bold [&_h3]:text-slate-900 dark:[&_h3]:text-white [&_h3]:mt-8 [&_h3]:mb-3
          [&_p]:mb-5
          [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:mb-5 [&_ul]:space-y-1
          [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:mb-5 [&_ol]:space-y-1
          [&_li]:leading-relaxed
          [&_strong]:text-slate-900 dark:[&_strong]:text-white [&_strong]:font-semibold
          [&_em]:italic
          [&_a]:text-brand-600 dark:[&_a]:text-brand-400 [&_a]:underline">
          <post.Body />
        </div>

        {/* Related */}
        {post.related && post.related.length > 0 && (
          <div className="mt-12 pt-8 border-t border-slate-200 dark:border-slate-700">
            <h3 className="text-sm font-semibold text-slate-900 dark:text-white mb-4">Keep reading</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              {post.related.map((slug) => {
                const rel = posts.find((p) => p.slug === slug);
                if (!rel) return null;
                return (
                  <button
                    key={slug}
                    onClick={() => navigate(`/blog/${slug}`)}
                    className="text-left p-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:border-brand-300 dark:hover:border-brand-700"
                  >
                    <div className="text-sm font-semibold text-slate-900 dark:text-white">{rel.title}</div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Signup nudge */}
        <div className="mt-12 p-6 rounded-2xl bg-gradient-to-br from-brand-600 to-brand-800 text-white shadow-xl text-center">
          <h3 className="text-xl md:text-2xl font-bold mb-2">Ready to stop fighting your PSA?</h3>
          <p className="text-brand-100 mb-5 text-sm">45 days. Full product. No credit card. Real trial.</p>
          <button
            onClick={() => navigate('/signup')}
            className="bg-white hover:bg-slate-100 text-brand-700 font-bold px-6 py-2.5 rounded-lg shadow"
          >
            Start free trial
          </button>
        </div>
      </article>
    </>
  );
}
