'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AiTextareaAssist } from '@/components/shared/ai/AiTextareaAssist';
import { Skeleton } from '@/components/ui/skeleton';
import { PlusCircle, Trash2, Link as LinkIcon, Image as ImageIcon, Edit2, GripVertical } from 'lucide-react';
import { ImageUploader } from '@/components/ui/ImageUploader';
import { getEventPartners, addPartner, deletePartner, updatePartner, reorderPartners, Partner } from '@/lib/services/partnerService';
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd';

export default function PartnersPage() {
  const params = useParams();
  const eventId = params.id as string;

  const [partners, setPartners] = useState<Partner[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newLink, setNewLink] = useState('');
  const [newLogo, setNewLogo] = useState('');

  useEffect(() => {
    getEventPartners(eventId).then(list => {
      setPartners(list);
      setLoading(false);
    });
  }, [eventId]);

  const handleAdd = async () => {
    if (!newName) return;
    const result = await addPartner(eventId, {
      name: newName,
      description: newDesc,
      websiteUrl: newLink,
      logoUrl: newLogo,
      tier: 'bronze',
      order: partners.length,
    });
    if (result.success && result.id) {
      setPartners(prev => [...prev, { id: result.id, name: newName, description: newDesc, websiteUrl: newLink, logoUrl: newLogo, tier: 'bronze', order: prev.length }]);
    }
    setIsAdding(false);
    setNewName(''); setNewDesc(''); setNewLink(''); setNewLogo('');
  };

  const handleEdit = (p: Partner) => {
    setEditingId(p.id!);
    setNewName(p.name);
    setNewDesc(p.description);
    setNewLink(p.websiteUrl);
    setNewLogo(p.logoUrl);
    setIsAdding(true);
  };

  const handleSaveEdit = async () => {
    if (!newName || !editingId) return;
    const result = await updatePartner(eventId, editingId, {
      name: newName,
      description: newDesc,
      websiteUrl: newLink,
      logoUrl: newLogo,
    });
    if (result.success) {
      setPartners(prev => prev.map(p => p.id === editingId ? { ...p, name: newName, description: newDesc, websiteUrl: newLink, logoUrl: newLogo } : p));
    }
    cancelEdit();
  };

  const cancelEdit = () => {
    setIsAdding(false);
    setEditingId(null);
    setNewName(''); setNewDesc(''); setNewLink(''); setNewLogo('');
  };

  const handleDragEnd = async (result: DropResult) => {
    if (!result.destination) return;
    const items = Array.from(partners);
    const [reorderedItem] = items.splice(result.source.index, 1);
    items.splice(result.destination.index, 0, reorderedItem);

    const updatedItems = items.map((item, index) => ({ ...item, order: index }));
    setPartners(updatedItems);

    await reorderPartners(eventId, updatedItems.map(i => ({ id: i.id!, order: i.order })));
  };

  const handleRemove = async (id: string) => {
    await deletePartner(eventId, id);
    setPartners(prev => prev.filter(p => p.id !== id));
  };

  if (loading) {
    return (
      <div className="container mx-auto py-10 max-w-4xl space-y-8">
        <Skeleton className="h-10 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {[1, 2].map(i => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto py-10 max-w-4xl space-y-8">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Event Partners</h1>
          <p className="text-muted-foreground mt-1">
            Showcase your sponsors, university partners, and affiliated organizations.
          </p>
        </div>
        {!isAdding && (
          <Button variant="outline" onClick={() => setIsAdding(true)} className="gap-2">
            <PlusCircle className="w-4 h-4" /> Add Partner
          </Button>
        )}
      </div>

      {isAdding && (
        <Card className="border-primary shadow-sm">
          <CardHeader>
            <CardTitle className="text-lg">{editingId ? 'Edit Partner' : 'Add New Partner'}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label>Partner Name</Label>
                  <Input placeholder="e.g. Harvard International Relations Council" value={newName} onChange={e => setNewName(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Website URL</Label>
                  <Input placeholder="https://" value={newLink} onChange={e => setNewLink(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>Short Description</Label>
                  <Textarea placeholder="A brief sentence about this partner..." value={newDesc} onChange={e => setNewDesc(e.target.value)} />
                  <AiTextareaAssist
                    value={newDesc}
                    onPick={setNewDesc}
                    surface="partner-description"
                    context={{ eventName: newName }}
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Partner Logo</Label>
                <ImageUploader value={newLogo} onChange={setNewLogo} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-4">
              <Button variant="ghost" onClick={cancelEdit}>Cancel</Button>
              <Button onClick={editingId ? handleSaveEdit : handleAdd} className="bg-primary text-white hover:bg-primary" disabled={!newName}>
                {editingId ? 'Save Changes' : 'Add to List'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <DragDropContext onDragEnd={handleDragEnd}>
        <Droppable droppableId="partners">
          {(provided) => (
            <div {...provided.droppableProps} ref={provided.innerRef} className="flex flex-col gap-4">
              {partners.map((partner, index) => (
                <Draggable key={partner.id} draggableId={partner.id!} index={index}>
                  {(provided) => (
                    <div ref={provided.innerRef} {...provided.draggableProps} className="bg-card text-card-foreground rounded-xl border shadow-sm overflow-hidden group">
                      <div className="flex flex-col sm:flex-row h-full items-stretch">
                        <div 
                          {...provided.dragHandleProps}
                          className="flex items-center justify-center px-4 bg-secondary border-r border-slate-200 dark:border-slate-700 cursor-grab active:cursor-grabbing text-slate-400 hover:text-primary transition-colors"
                        >
                          <GripVertical className="w-5 h-5" />
                        </div>
                        <div className="sm:w-48 bg-secondary flex items-center justify-center p-6 border-b sm:border-b-0 sm:border-r">
                          {partner.logoUrl ? (
                            <img src={partner.logoUrl} alt={partner.name} className="max-h-20 object-contain" />
                          ) : (
                            <div className="w-16 h-16 bg-secondary rounded-full flex items-center justify-center text-slate-400">
                              <ImageIcon className="w-6 h-6" />
                            </div>
                          )}
                        </div>
                        <div className="p-4 flex-1 flex flex-col justify-between min-h-[120px]">
                          <div>
                            <h3 className="font-semibold text-lg">{partner.name}</h3>
                            <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{partner.description}</p>
                          </div>
                          <div className="mt-4 flex items-center justify-between">
                            {partner.websiteUrl ? (
                              <a href={partner.websiteUrl} target="_blank" rel="noopener noreferrer" className="text-xs flex items-center gap-1 text-primary hover:underline">
                                <LinkIcon className="w-3 h-3" /> Visit Site
                              </a>
                            ) : <div />}
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEdit(partner)}
                                className="text-muted-foreground hover:text-primary h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleRemove(partner.id!)}
                                className="text-muted-foreground hover:text-red-600 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </Draggable>
              ))}
              {provided.placeholder}
              {partners.length === 0 && !isAdding && (
                <div className="col-span-1 text-center py-12 text-muted-foreground border-2 border-dashed rounded-xl">
                  No partners added yet.
                </div>
              )}
            </div>
          )}
        </Droppable>
      </DragDropContext>
    </div>
  );
}
