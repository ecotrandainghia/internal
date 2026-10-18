// Gmail giả cho test hộp thư: vài luồng thư, nhãn, gửi thư (ghi lại để kiểm tra). Đủ những hàm app dùng.
function fakeGmail(clubEmail = 'clb@example.com') {
  const sent = [];
  const labels = {};
  const threads = [];
  let next = 1;
  const label = (name) => labels[name] || null;
  const makeLabel = (name) => {
    labels[name] = {
      getName: () => name,
      addToThread: (w) => { const t = w._t; if (!t.labels.includes(name)) t.labels.push(name); },
      removeFromThread: (w) => { w._t.labels = w._t.labels.filter((x) => x !== name); }
    };
    return labels[name];
  };
  const message = (t, m) => ({
    getId: () => m.id, getFrom: () => m.from, getTo: () => m.to, getCc: () => m.cc || '', getDate: () => m.date, getSubject: () => m.subject,
    getBody: () => m.html, getPlainBody: () => m.html.replace(/<[^>]+>/g, ''), getThread: () => thread(t),
    getAttachments: () => (m.files || []).map((f) => ({ getName: () => f.name, getSize: () => f.bytes.length, getContentType: () => 'text/plain', getBytes: () => f.bytes })),
    createDraftReply: (text, opts) => ({ send: () => { sent.push({ kind: 'reply', thread: t.id, to: m.from, text, opts }); } }),
    createDraftReplyAll: (text, opts) => ({ send: () => { sent.push({ kind: 'reply_all', thread: t.id, to: m.from, text, opts }); } }),
    forward: (to, opts) => { sent.push({ kind: 'forward', thread: t.id, to, opts }); }
  });
  const thread = (t) => ({
    _t: t,
    getId: () => t.id, getFirstMessageSubject: () => t.messages[0].subject, getMessages: () => t.messages.map((m) => message(t, m)),
    getLastMessageDate: () => t.messages[t.messages.length - 1].date, isUnread: () => !!t.unread,
    getLabels: () => t.labels.map((n) => label(n) || makeLabel(n)),
    isInInbox: () => t.box === 'inbox', isInTrash: () => t.box === 'trash', isInSpam: () => t.box === 'spam',
    moveToArchive: () => { t.box = 'archive'; }, moveToInbox: () => { t.box = 'inbox'; }, moveToTrash: () => { t.box = 'trash'; }, moveToSpam: () => { t.box = 'spam'; }
  });
  const drafts = [];
  const blob = (f) => ({ getName: () => f.name, getSize: () => f.bytes.length, getContentType: () => f.type || 'text/plain', getBytes: () => f.bytes });
  const draft = (d) => ({
    getId: () => d.id,
    getMessage: () => ({
      getId: () => 'dm' + d.id, getSubject: () => d.subject, getBody: () => d.html, getTo: () => d.to || '', getCc: () => '', getBcc: () => '', getDate: () => d.date,
      getAttachments: (o = {}) => (d.files || []).filter((f) => (f.inline ? o.includeInlineImages : o.includeAttachments !== false)).map(blob)
    }),
    send: () => { sent.push({ kind: 'draft', to: d.to, subject: d.subject, opts: { htmlBody: d.html } }); drafts.splice(drafts.indexOf(d), 1); }
  });
  const api = {
    threads, sent, drafts,
    addDraft(subject, html, extra = {}) {
      const d = { id: 'r-' + next++, subject, html, date: new Date(Date.now() + next * 1000), ...extra };
      drafts.unshift(d);
      return d.id;
    },
    add(subject, from, html, extra = {}) {
      const t = { id: 'th' + next++, box: 'inbox', labels: [], unread: true, ...extra, messages: [] };
      t.messages.push({ id: 'msg' + next++, from, to: clubEmail, subject, html, date: new Date(Date.now() - 36e5), files: extra.files || [] });
      threads.push(t);
      return t.id;
    },
    GmailApp: {
      search: (q, start, max) => threads.filter((t) => (q.includes('in:inbox') ? t.box === 'inbox' : q.includes('in:trash') ? t.box === 'trash'
        : q.includes('label:') ? t.labels.includes(/label:"([^"]+)"/.exec(q)[1]) : true)).slice(start, start + max).map(thread),
      getThreadById: (id) => { const t = threads.find((x) => x.id === id); return t ? thread(t) : null; },
      getMessageById: (id) => { for (const t of threads) { const m = t.messages.find((x) => x.id === id); if (m) return message(t, m); } return null; },
      getUserLabels: () => Object.keys(labels).map((n) => labels[n]),
      getUserLabelByName: (n) => label(n),
      createLabel: (n) => makeLabel(n),
      getDrafts: () => drafts.map(draft),
      getDraft: (id) => { const d = drafts.find((x) => x.id === id); if (!d) throw new Error('Invalid argument: id'); return draft(d); },
      sendEmail: (to, subject, text, opts) => {
        if (/fail/.test(to)) throw new Error('Địa chỉ bị từ chối');
        sent.push({ kind: 'bulk', to, subject, text, opts });
      },
      createDraft: (to, subject, text, opts) => ({
        send: () => {
          const id = api.add(subject, clubEmail, opts.htmlBody, { box: 'sent', unread: false });
          sent.push({ kind: 'compose', to, subject, text, opts, thread: id });
          return { getThread: () => thread(threads.find((x) => x.id === id)) };
        }
      })
    },
    Gmail: { Users: { Settings: { SendAs: { list: () => ({ sendAs: [{ isDefault: true, signature: '<b>CLB ECO</b>' }] }) } } } }
  };
  makeLabel('Tài trợ');
  return api;
}

module.exports = { fakeGmail };
