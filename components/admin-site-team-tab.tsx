"use client";

import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@/convex/_generated/api";
import { FOUNDER_PROFILE_IMAGE } from "@/lib/site-defaults";
import type { Doc, Id } from "@/convex/_generated/dataModel";
import {
  AdminField,
  AdminListRow,
  adminInputClass,
} from "@/components/admin-primitives";
import { defaultPageCopy } from "@/components/admin-site-defaults";

export function useTeamEditor() {
  const [memberName, setMemberName] = useState("");
  const [memberRole, setMemberRole] = useState("");
  const [memberBio, setMemberBio] = useState("");
  const [memberImageUrl, setMemberImageUrl] = useState("");
  const [memberOrder, setMemberOrder] = useState(0);
  const [editingMemberId, setEditingMemberId] = useState<Id<"teamMembers"> | null>(null);

  const teamMembers = useQuery(api.site.listTeamMembers);

  const upsertTeamMember = useMutation(api.site.upsertTeamMember);
  const deleteTeamMember = useMutation(api.site.deleteTeamMember);
  const seedInitialData = useMutation(api.site.seedInitialData);

  const resetTeamForm = () => {
    setMemberName("");
    setMemberRole("");
    setMemberBio("");
    setMemberImageUrl("");
    setMemberOrder(0);
    setEditingMemberId(null);
  };

  const handleSeed = async () => {
    if (!confirm("Initialize site with Dalen's profile and default content?")) return;
    try {
      await seedInitialData({
        aboutContent: defaultPageCopy.about.content,
        founderBio: defaultPageCopy.founder.content,
        foundersContent: defaultPageCopy.founders.content,
        teamContent: defaultPageCopy.team.content,
        contactContent: defaultPageCopy.contact.content,
        founderImageUrl: FOUNDER_PROFILE_IMAGE,
      });
      alert("Site initialized!");
    } catch (error) {
      console.error(error);
      alert("Error seeding data");
    }
  };

  const handleTeamSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await upsertTeamMember({
        id: editingMemberId ?? undefined,
        name: memberName,
        role: memberRole,
        bio: memberBio,
        imageUrl: memberImageUrl || null,
        order: memberOrder,
      });
      resetTeamForm();
    } catch (error) {
      console.error(error);
      alert("Error saving team member");
    }
  };

  const handleEditMember = (member: Doc<"teamMembers">) => {
    setMemberName(member.name);
    setMemberRole(member.role);
    setMemberBio(member.bio);
    setMemberImageUrl(member.imageUrl || "");
    setMemberOrder(member.order);
    setEditingMemberId(member._id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return {
    memberName,
    setMemberName,
    memberRole,
    setMemberRole,
    memberBio,
    setMemberBio,
    memberImageUrl,
    setMemberImageUrl,
    memberOrder,
    setMemberOrder,
    editingMemberId,
    teamMembers,
    resetTeamForm,
    handleSeed,
    handleTeamSubmit,
    handleEditMember,
    deleteMember: (member: Doc<"teamMembers">) => deleteTeamMember({ id: member._id }),
  };
}

export type TeamEditor = ReturnType<typeof useTeamEditor>;

export function SiteTeamTab({ editor }: { editor: TeamEditor }) {
  const {
    memberName,
    setMemberName,
    memberRole,
    setMemberRole,
    memberBio,
    setMemberBio,
    memberImageUrl,
    setMemberImageUrl,
    memberOrder,
    setMemberOrder,
    editingMemberId,
    teamMembers,
    resetTeamForm,
    handleSeed,
    handleTeamSubmit,
    handleEditMember,
    deleteMember,
  } = editor;

  return (
    <div className="space-y-12 animate-reveal">
      <form
        onSubmit={handleTeamSubmit}
        className="space-y-6 p-8 bg-card/50 backdrop-blur-sm border border-border/50 rounded-2xl corner-tick corner-tick-tr corner-tick-bl shadow-xl"
      >
        <h2 className="text-2xl font-serif font-bold tracking-tight mb-4 flex items-center gap-2">
          <span className="w-2 h-2 bg-primary rounded-full glow-primary-sm" />
          {editingMemberId ? "Edit Member" : "New Member"}
        </h2>

        <div className="grid md:grid-cols-2 gap-6">
          <AdminField label="Name">
            <input
              type="text"
              value={memberName}
              onChange={(e) => setMemberName(e.target.value)}
              className={adminInputClass}
              required
            />
          </AdminField>

          <AdminField label="Role">
            <input
              type="text"
              value={memberRole}
              onChange={(e) => setMemberRole(e.target.value)}
              className={adminInputClass}
              required
            />
          </AdminField>
        </div>

        <AdminField label="Bio">
          <textarea
            value={memberBio}
            onChange={(e) => setMemberBio(e.target.value)}
            className={`${adminInputClass} font-sans text-sm`}
            rows={3}
            required
          />
        </AdminField>

        <div className="grid md:grid-cols-2 gap-6">
          <AdminField label="Image URL (optional)">
            <input
              type="text"
              value={memberImageUrl}
              onChange={(e) => setMemberImageUrl(e.target.value)}
              className={adminInputClass}
            />
          </AdminField>

          <AdminField label="Display Order">
            <input
              type="number"
              value={memberOrder}
              onChange={(e) => setMemberOrder(parseInt(e.target.value) || 0)}
              className={adminInputClass}
              required
            />
          </AdminField>
        </div>

        <div className="flex gap-4 pt-4">
          <button
            type="submit"
            className="px-8 py-3 bg-primary text-primary-foreground font-mono font-bold uppercase tracking-widest rounded-sm hover:scale-[1.02] active:scale-[0.98] transition-all glow-primary"
          >
            {editingMemberId ? "Update Member" : "Add Member"}
          </button>
          {editingMemberId && (
            <button
              type="button"
              onClick={resetTeamForm}
              className="px-8 py-3 border border-border font-mono font-bold uppercase tracking-widest text-muted-foreground rounded-sm hover:border-primary/50 hover:text-primary transition-all"
            >
              Cancel
            </button>
          )}
        </div>
      </form>

      <div className="space-y-6">
        <h2 className="text-2xl font-serif font-bold tracking-tight border-b border-border/50 pb-4">
          Team Roster
        </h2>
        {!teamMembers ? (
          <p className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground animate-pulse">
            Loading roster...
          </p>
        ) : teamMembers.length === 0 ? (
          <div className="p-12 border border-dashed border-border rounded-2xl text-center space-y-4">
            <p className="text-muted-foreground font-mono text-xs uppercase tracking-widest italic">
              The roster is currently empty.
            </p>
            <button
              onClick={handleSeed}
              className="px-6 py-2 bg-primary/10 text-primary border border-primary/20 rounded-sm font-mono text-[10px] font-bold uppercase tracking-widest hover:bg-primary/20 transition-all"
            >
              Initialize with Dalen's Profile
            </button>
          </div>
        ) : (
          <div className="grid gap-4">
            {teamMembers.map((member) => (
              <AdminListRow
                key={member._id}
                title={member.name}
                subtitle={`${member.role} (Order: ${member.order})`}
              >
                <button
                  onClick={() => handleEditMember(member)}
                  className="px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest border border-border rounded-sm hover:border-primary/50 hover:text-primary transition-all"
                >
                  Modify
                </button>
                <button
                  onClick={() => {
                    if (confirm("Delete this member?")) {
                      deleteMember(member);
                    }
                  }}
                  className="px-4 py-2 font-mono text-[10px] font-bold uppercase tracking-widest border border-border rounded-sm hover:border-destructive hover:text-destructive transition-all"
                >
                  Delete
                </button>
              </AdminListRow>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
